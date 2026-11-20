import test from 'node:test';
import assert from 'node:assert/strict';
import {list} from '../src/data.js';

test('admin list searches long Chinese titles without a LIKE pattern-limit failure',async()=>{
  const query='亞馬遜的折扣幻象：三分之一的「優惠」沒有折扣——十分之一的優惠價格更高';
  const statements=[];
  const db={prepare(sql){
    const statement={sql,params:[]};
    statements.push(statement);
    return {bind(...params){
      statement.params=params;
      return {first:async()=>({n:1}),all:async()=>({results:[]})};
    }};
  }};
  const result=await list(db,{privateList:true,filter:'unread',sort:'old',q:query});
  assert.equal(result.total,1);
  assert.equal(statements.length,2);
  for(const [i,statement] of statements.entries()){
    assert.doesNotMatch(statement.sql,/\bLIKE\b/);
    assert.equal((statement.sql.match(/INSTR\(/g)||[]).length,6);
    assert.match(statement.sql,/b\.stage=0/);
    assert.deepEqual(statement.params.slice(0,6),Array(6).fill(query));
    assert.equal(statement.params.length,i===0?6:7);
  }
});

test('search queries keep percent and underscore as literal characters',async()=>{
  const query='50%_off';
  const binds=[];
  const db={prepare(sql){return {bind(...args){binds.push(args);return {first:async()=>({n:0}),all:async()=>({results:[]})};}};}};
  await list(db,{privateList:true,q:query});
  assert.deepEqual(binds[0],Array(6).fill(query));
});
