import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMessage } from '../src/persona/classifier.ts';
import { PERSONA_SEED } from '../src/persona/schema.ts';
import type { Persona } from '../src/persona/schema.ts';

function learningPersona(): Persona {
  return {
    ...PERSONA_SEED,
    learning: { ...PERSONA_SEED.learning, maturity: 'learning' },
  };
}

describe('classifyMessage', () => {
  it('classifies "你好" as greeting, auto-claimable', () => {
    const r = classifyMessage('你好', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'greeting');
    assert.equal(r.canAutoClaim, true);
  });

  it('classifies "hello!" as greeting', () => {
    const r = classifyMessage('hello!', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'greeting');
    assert.equal(r.canAutoClaim, true);
  });

  it('classifies "ok" as acknowledgement', () => {
    const r = classifyMessage('ok', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'acknowledgement');
    assert.equal(r.canAutoClaim, true);
  });

  it('classifies "谢谢" as acknowledgement', () => {
    const r = classifyMessage('谢谢', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'acknowledgement');
    assert.equal(r.canAutoClaim, true);
  });

  it('flags sensitive keyword "密码" as high risk', () => {
    const r = classifyMessage('我忘记了密码', PERSONA_SEED, 'guest');
    assert.equal(r.risk, 'high');
    assert.equal(r.canAutoClaim, false);
  });

  it('flags decision keyword "合同"', () => {
    const r = classifyMessage('这个合同需要签一下', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'decision');
    assert.equal(r.canAutoClaim, false);
  });

  it('flags complaint keyword "投诉"', () => {
    const r = classifyMessage('我要投诉', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'complaint');
    assert.equal(r.canAutoClaim, false);
  });

  it('flags personal keyword "家人"', () => {
    const r = classifyMessage('家人生病了', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'personal');
    assert.equal(r.canAutoClaim, false);
  });

  it('scheduling with seed persona cannot auto-claim', () => {
    const r = classifyMessage('明天的会议几点', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'scheduling');
    assert.equal(r.canAutoClaim, false);
  });

  it('scheduling with learning persona can auto-claim', () => {
    const r = classifyMessage('明天的会议几点', learningPersona(), 'guest');
    assert.equal(r.intent, 'scheduling');
    assert.equal(r.canAutoClaim, true);
  });

  it('status check "在吗" with seed cannot auto-claim', () => {
    const r = classifyMessage('在吗', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'status_check');
    assert.equal(r.canAutoClaim, false);
  });

  it('admin messages always pass through', () => {
    const r = classifyMessage('你好', PERSONA_SEED, 'admin');
    assert.equal(r.canAutoClaim, false);
    assert.equal(r.reason, 'admin messages always pass through');
  });

  it('empty message returns unknown', () => {
    const r = classifyMessage('', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'unknown');
    assert.equal(r.canAutoClaim, false);
  });

  it('short unknown message classified as faq', () => {
    const r = classifyMessage('test', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'faq');
    assert.equal(r.risk, 'low');
  });

  it('long unknown message classified as unknown with medium risk', () => {
    const r = classifyMessage('这是一段比较长的消息，内容和任何关键词都不匹配，应该被归类为未知意图', PERSONA_SEED, 'guest');
    assert.equal(r.intent, 'unknown');
    assert.equal(r.risk, 'medium');
    assert.equal(r.canAutoClaim, false);
  });
});
