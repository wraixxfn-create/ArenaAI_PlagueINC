import assert from 'node:assert/strict';
import { EARTH } from '../src/data/earth.js';
import { COUNTRIES } from '../src/data/countries.js';
import { pointInPoly, polyArea } from '../src/ui/geo.js';
import { geoEqualEarth } from 'd3-geo';
const project = geoEqualEarth().fitExtent([[1,1],[99,51]],{type:'Sphere'});
const pick = (lon,lat) => {
  const [x,y]=project([lon,lat]);
  return EARTH.countries.find(f=>f.rings.reduce((inside,r)=>inside!==pointInPoly(x,y,r),false));
};
assert.equal(EARTH.countries.length,177);
assert.equal(new Set(EARTH.countries.filter(f=>f.id).map(f=>f.id)).size,COUNTRIES.length);
for(const c of COUNTRIES)assert.ok(EARTH.countries.some(f=>f.id===c.id),c.id);
for(const [lon,lat,id] of [[-100,40,'usa'],[-150,65,'usa'],[100,60,'rus'],[179,66,'rus'],[-179,67,'rus'],[2,47,'fra'],[78,22,'ind'],[134,-25,'aus'],[-43,72,'grl'],[138,37,'jpn'],[174,-41,'nzl'],[110,-7,'idn'],[120,-2,'idn'],[-71,-32,'chl']]) {
  assert.equal(pick(lon,lat)?.id,id,`geographic hit ${lon},${lat}`);
}
assert.equal(pick(18,-22)?.id,null,'Namibia remains neutral, not assigned to another country');
assert.equal(pick(-30,0),undefined,'Atlantic remains ocean');
const area=id=>EARTH.countries.find(f=>f.id===id).rings.reduce((sum,r)=>sum+polyArea(r),0);
const ratio=area('aus')/area('grl');
assert.ok(ratio>3.3 && ratio<3.9,`equal-area Australia / Greenland = ${ratio}`);
for(const f of EARTH.countries)for(const r of f.rings)for(const [x,y] of r)assert.ok(Number.isFinite(x+y) && x>=0 && x<=100 && y>=0 && y<=52);
assert.ok(EARTH.countries.find(f=>f.id==='idn').rings.length>5,'archipelago preserves separate islands');
assert.ok(EARTH.countries.find(f=>f.id==='rus').rings.length>1,'dateline geometry is split');
assert.ok(Array.isArray(EARTH.graticule) && EARTH.graticule.length>=40,'pre-projected graticule ships with the map');
for(const line of EARTH.graticule){assert.ok(line.length>=2,'graticule line has points');for(const [x,y] of line)assert.ok(Number.isFinite(x+y)&&x>=0&&x<=100&&y>=0&&y<=52,'graticule within projected bounds');}
console.log('Earth geometry passed: 177 features, all simulated IDs, geographic hits, neutral land, ocean, area ratios, islands, dateline and graticule.');
