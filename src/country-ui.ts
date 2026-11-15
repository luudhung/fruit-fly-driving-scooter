export type CountryPerson = {
  id?: string; name?: string; ageYears?: number; ownsHome?: boolean;
  citizenshipCountryId?: string | null; residencyCountryId?: string | null;
  legalResidency?: {countryId?: string; seconds?: number} | null;
};
type ConflictReceipt = {accepted?: boolean; requestId?: string; id?: string; status?: string; reason?: string; duplicate?: boolean};
type ConflictView = {requested?: number; completed?: number; queued?: number; active?: (ConflictReceipt & {fromCountryId?: string; toCountryId?: string}) | null};
export type CountrySnapshot = {
  international?: {
    countries?: Array<{id: string; name?: string; citizens?: number; residents?: number; cash?: number; seasonal?: boolean; populationPolicy?: {birthGrant?: number; housingHelp?: number; immigrationSupport?: number}}>;
    visaFee?: number; ownNationalsExempt?: boolean; conflicts?: ConflictView;
  };
  districtEconomy?: Array<{id: string; residents?: number}>;
  selectedFly?: CountryPerson | null;
};
type RequestState = 'idle' | 'sending' | 'uncertain' | 'rejected' | 'accepted';
type RequestStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const countryNames: Record<string, string> = {hansdrex: 'Hansdrex', 'north-city': 'North City', hawaii: 'Hawaii'};
const countryName = (id?: string | null) => id ? countryNames[id] || id : 'Chưa có dữ liệu';
const number = (value?: number) => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 0}).format(value!) : '—';
const money = (value?: number) => `${number(value)} H$`;
function sessionStore(): RequestStorage | undefined {try {return globalThis.sessionStorage;} catch {return undefined;}}

/** A lost response retains its request identity, including across a page reload. */
export class ConflictRequests {
  state: RequestState = 'idle';
  requestId: string | null = null;
  receipt: ConflictReceipt | null = null;
  error = '';
  pending = false;
  private confirmedId: string | null = null;
  private readonly storageKey: string;
  private readonly options: {apiBase: string; onRefresh?: () => unknown; onChange?: () => void; fetchImpl?: typeof fetch; uuid?: () => string; storage?: RequestStorage};
  constructor(options: ConflictRequests['options']) {
    this.options = options;
    this.storageKey = `civilization-conflict-pending:${options.apiBase}`;
    try {this.requestId = options.storage?.getItem(this.storageKey) || null;} catch { /* Storage can be unavailable in private browsing. */ }
    if(this.requestId)this.state = 'uncertain';
  }
  private persist(id: string | null) {
    this.requestId = id;
    try {if(id)this.options.storage?.setItem(this.storageKey, id);else this.options.storage?.removeItem(this.storageKey);} catch { /* The in-memory identity still protects retries. */ }
  }
  reconcile(active?: ConflictReceipt | null) {
    if(!this.requestId || active?.requestId !== this.requestId)return;
    this.confirmedId = this.requestId;
    this.receipt = active;
    this.persist(null);
    this.error = '';
    this.state = 'accepted';
    this.options.onChange?.();
  }
  async submit(): Promise<void> {
    if(this.pending)return;
    const requestId = this.requestId || (this.options.uuid || (() => crypto.randomUUID()))();
    this.persist(requestId);
    this.pending = true;this.state = 'sending';this.error = '';this.options.onChange?.();
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await (this.options.fetchImpl || fetch)(`${this.options.apiBase.replace(/\/$/, '')}/api/civilization/conflict`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requestId, quick: true}), signal: abort.signal,
      });
      let payload: Record<string, unknown> = {};
      try {payload = await response.json() as Record<string, unknown>;} catch { /* An invalid success response is also uncertain. */ }
      if(!response.ok) {
        const reason = typeof payload.reason === 'string' ? payload.reason : typeof payload.error === 'string' ? payload.error : `Máy chủ trả lỗi ${response.status}.`;
        if(response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) {
          this.persist(null);this.state = 'rejected';this.error = reason;return;
        }
        throw new Error(reason);
      }
      const receipt = (payload.conflict || payload.request || payload) as ConflictReceipt;
      if(receipt.accepted === false || payload.accepted === false) {
        this.persist(null);this.state = 'rejected';this.error = receipt.reason || 'Yêu cầu chưa được chấp nhận.';return;
      }
      if(receipt.accepted !== true && payload.accepted !== true)throw new Error('Chưa xác nhận được phản hồi của máy chủ.');
      this.confirmedId = requestId;this.receipt = {...receipt, requestId};this.persist(null);this.state = 'accepted';
      try {void Promise.resolve(this.options.onRefresh?.()).catch(() => {});} catch { /* The accepted command stays accepted if a subsequent read fails. */ }
    } catch(error) {
      if(this.confirmedId === requestId) {this.state = 'accepted';this.error = '';}
      else {this.state = 'uncertain';this.error = error instanceof Error && error.name !== 'AbortError' ? error.message : 'Kết nối bị gián đoạn.';}
    } finally {clearTimeout(timer);this.pending = false;this.options.onChange?.();}
  }
}

export function countryDashboardLines(snapshot: CountrySnapshot): string[][] {
  return ['hansdrex', 'north-city', 'hawaii'].map(id => {
    const country = snapshot.international?.countries?.find(c => c.id === id), policy = country?.populationPolicy;
    return [countryNames[id], `Nhà ở: ${number(country?.residents)} người · Quốc tịch: ${number(country?.citizens)} người`,
      `Ngân quỹ: ${money(country?.cash)}`, `Sinh con ${money(policy?.birthGrant)} · Nhà ở ${money(policy?.housingHelp)} · Nhập cư ${money(policy?.immigrationSupport)}`,
      ...(id === 'hawaii' ? ['Đảo nghỉ dưỡng theo mùa'] : [])];
  });
}

export class CountryUI {
  readonly requests: ConflictRequests;
  private snapshot: CountrySnapshot = {};
  private selected: CountryPerson | null = null;
  private readonly button: HTMLButtonElement | null;
  private readonly rows: HTMLElement | null;
  private readonly status: HTMLElement | null;
  private readonly districts: HTMLElement | null;
  private readonly visa: HTMLElement | null;
  private readonly person: HTMLElement | null;
  constructor({apiBase, onRefresh}: {apiBase: string; onRefresh?: () => unknown}) {
    this.button = document.getElementById('country-conflict-button') as HTMLButtonElement | null;
    this.rows = document.getElementById('country-dashboard');this.status = document.getElementById('country-conflict-status');
    this.districts = document.getElementById('country-hans-districts');this.visa = document.getElementById('country-visa-policy');this.person = document.getElementById('country-selected-person');
    this.requests = new ConflictRequests({apiBase, onRefresh, storage: sessionStore(), onChange: () => this.renderRequest()});
    this.button?.addEventListener('click', event => {event.stopPropagation();void this.requests.submit();});
    this.renderRequest();
  }
  sync(snapshot: CountrySnapshot) {
    this.snapshot = snapshot;
    this.requests.reconcile(snapshot.international?.conflicts?.active);
    if(this.rows) {
      const cards = countryDashboardLines(snapshot).map(lines => {
        const card = document.createElement('div');card.className = 'country-card';
        for(const [i, text] of lines.entries()) {const line = document.createElement(i === 0 ? 'strong' : 'div');line.textContent = text;card.append(line);}
        return card;
      });
      this.rows.replaceChildren(...cards);
    }
    const districts = snapshot.districtEconomy;
    if(this.districts)this.districts.textContent = `Nhà chính Hansdrex · Main ${number(districts?.find(d => d.id === 'main')?.residents)} · Europe ${number(districts?.find(d => d.id === 'europe')?.residents)} · West ${number(districts?.find(d => d.id === 'west')?.residents)}`;
    const life = snapshot.international;
    if(this.visa)this.visa.textContent = life ? `Visa nhập cảnh: ${money(life.visaFee)} / người / lượt.${life.ownNationalsExempt ? ' Công dân về nước mình được miễn phí.' : ''}` : 'Đang nhận chính sách nhập cảnh…';
    if(snapshot.selectedFly?.citizenshipCountryId)this.selected = snapshot.selectedFly;
    this.renderSelected();this.renderRequest();
  }
  syncSelected(person: CountryPerson | null) {this.selected = person;this.renderSelected();}
  private renderSelected() {
    if(!this.person)return;
    this.person.replaceChildren();
    const f = this.selected;
    if(!f?.citizenshipCountryId) {this.person.textContent = 'Chọn một cư dân để xem quốc tịch và thời gian cư trú.';return;}
    const lines = [`${f.name || f.id || 'Cư dân'} · Quốc tịch ${countryName(f.citizenshipCountryId)}`, `Cư trú: ${countryName(f.residencyCountryId)}`];
    const foreign = f.residencyCountryId && f.citizenshipCountryId !== f.residencyCountryId;
    if(foreign) {
      const seconds = f.legalResidency?.countryId === f.residencyCountryId ? f.legalResidency?.seconds : undefined;
      lines.push(`Cư trú hợp pháp: ${number(seconds == null ? undefined : Math.floor(seconds / 86400))} / 300 ngày`,
        f.ownsHome == null ? 'Quyền sở hữu nhà: chưa có dữ liệu.' : f.ownsHome ? 'Đã có nhà sở hữu; cần đủ 300 ngày cư trú hợp pháp.' : 'Cần sở hữu nhà tại quốc gia đang cư trú để nhập tịch.');
      if(f.ageYears != null && f.ageYears < 18)lines.push('Nhập tịch khi đủ 18 tuổi.');
    }
    for(const text of lines) {const line = document.createElement('div');line.textContent = text;this.person.append(line);}
  }
  private renderRequest() {
    const request = this.requests, view = this.snapshot.international?.conflicts;
    let message = '';
    if(request.pending)message = 'Đang gửi yêu cầu…';
    else if(request.state === 'uncertain')message = `${request.error ? `${request.error} ` : ''}Chưa rõ máy chủ đã nhận. Bấm kiểm tra lại để tiếp tục cùng yêu cầu.`;
    else if(request.state === 'rejected')message = request.error;
    else if(request.state === 'accepted')message = request.receipt?.status === 'peace' ? 'Yêu cầu đã được thực hiện.' : 'Máy chủ đã nhận yêu cầu.';
    const canonical = view ? `Yêu cầu ${number(view.requested)} · Chờ ${number(view.queued)} · Kết thúc ${number(view.completed)}${view.active ? ' · Đang diễn ra' : ''}` : 'Đang nhận trạng thái từ thành phố…';
    if(this.status)this.status.textContent = [canonical, message].filter(Boolean).join('\n');
    if(this.button) {
      this.button.disabled = request.pending;
      this.button.textContent = request.pending ? '⏳ Đang gửi…' : request.state === 'uncertain' ? '↻ Kiểm tra yêu cầu' : '⚔ Chiến tranh thử';
      this.button.title = [canonical, message || 'Gửi một yêu cầu chiến tranh thử ngắn.'].join('\n');
      this.button.setAttribute('aria-busy', String(request.pending));
    }
  }
}
