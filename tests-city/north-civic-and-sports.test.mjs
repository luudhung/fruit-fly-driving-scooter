import test from 'node:test';
import assert from 'node:assert/strict';
import {BORDER_CUSTOMS_BUILDINGS, NORTH_AIRPORT, NORTH_SPORTS_PARK, NORTH_WHITE_HOUSE, countryAt} from '../worker/country-map.mjs';
import {BUILDINGS, LOCATIONS, ROADS, WATER, entrance, overlaps, pedestrianRoute} from '../worker/city-map.mjs';
import {LIFE_SKILLS, lifeSkillsLesson, readyToDrive} from '../worker/life-skills.mjs';

test('the North sports park fits between the runway, street network and river, and each venue has walking access',()=>{
 const park=NORTH_SPORTS_PARK;
 assert.equal(park.tennis.length,4);
 const surfaces=[park.golf,...park.tennis,park.football,park.clubhouse];
 for(const [i,field] of surfaces.entries()){
  assert.equal(countryAt(field),'north-city');
  assert.ok(Math.abs(field.x-park.x)+field.w/2<=park.w/2);
  assert.ok(Math.abs(field.z-park.z)+field.d/2<=park.d/2);
  assert.ok(!surfaces.slice(i+1).some(other=>overlaps(field,other)));
  assert.ok(![NORTH_AIRPORT.runway,NORTH_AIRPORT.apron,...ROADS,...WATER,...BUILDINGS.filter(b=>b.id!==park.clubhouse.id)].some(b=>overlaps(field,b)),JSON.stringify(field));
 }
 for(const venue of park.activities){
  assert.ok(LOCATIONS.some(l=>l.id===venue.id));
  const route=pedestrianRoute(NORTH_AIRPORT.gate,venue);
  assert.ok(route.length,venue.id);
  assert.ok(route.every(p=>countryAt(p)==='north-city'),venue.id);
 }
 assert.ok(![...ROADS,...WATER,...BUILDINGS.filter(b=>b.id!==NORTH_WHITE_HOUSE.id)].some(b=>overlaps(NORTH_WHITE_HOUSE,b)));
 assert.ok(entrance(NORTH_WHITE_HOUSE).z>NORTH_WHITE_HOUSE.z);
 for(const booth of BORDER_CUSTOMS_BUILDINGS){
  for(const dx of [-booth.w/2,booth.w/2])for(const dz of [-booth.d/2,booth.d/2])
   assert.equal(countryAt({x:booth.x+dx,z:booth.z+dz}),booth.countryId,booth.id);
 }
});

test('onboarding skills need supervised time, persist through restore, and only adults can apply driving knowledge',()=>{
 let resident={ageYears:12,lifeSkillsOnboarding:true,lawAwareness:.65};
 const lesson=(now,supervised=true)=>lifeSkillsLesson(resident,{now,elapsed:300,schoolId:'north-school',supervised});
 assert.equal(lesson(300,false),null);
 assert.equal(resident.lifeSkills,undefined);
 lesson(300);
 lesson(300);
 assert.equal(resident.lifeSkills.minutes.home,5);
 resident=structuredClone(resident);
 for(let time=600;time<=8400;time+=300)lesson(time);
 assert.deepEqual(resident.lifeSkills.completed,LIFE_SKILLS);
 assert.equal(resident.lifeSkills.schoolId,'north-school');
 assert.equal(readyToDrive(resident),false);
 resident.ageYears=18;
 assert.equal(readyToDrive(resident),true);
 assert.equal(readyToDrive({ageYears:30,lifeSkillsOnboarding:true}),false);
 assert.equal(readyToDrive({ageYears:30}),true);
 lesson(9000);
 assert.equal(resident.lifeSkills.completed.length,LIFE_SKILLS.length);
});
