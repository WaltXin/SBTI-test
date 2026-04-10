'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { questions, specialQuestions, DRUNK_TRIGGER_QUESTION_ID } from './data/questions';
import { dimensionMeta, dimensionOrder, DIM_EXPLANATIONS } from './data/dimensions';
import { TYPE_LIBRARY, TYPE_IMAGES, NORMAL_TYPES } from './data/types';
import { getPairingText } from './data/pairings';
import type { Question } from './data/questions';

type Screen = 'intro' | 'test' | 'result' | 'pairing';

const ALL_TYPE_CODES = Object.keys(TYPE_LIBRARY);

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sumToLevel(score: number): string {
  if (score <= 3) return 'L';
  if (score === 4) return 'M';
  return 'H';
}

function levelNum(level: string): number {
  return { L: 1, M: 2, H: 3 }[level] ?? 2;
}

function parsePattern(pattern: string): string[] {
  return pattern.replace(/-/g, '').split('');
}

function computeResult(answers: Record<string, number>) {
  const rawScores: Record<string, number> = {};
  Object.keys(dimensionMeta).forEach(dim => { rawScores[dim] = 0; });

  questions.forEach(q => {
    if (q.dim) {
      rawScores[q.dim] += Number(answers[q.id] || 0);
    }
  });

  const levels: Record<string, string> = {};
  Object.entries(rawScores).forEach(([dim, score]) => {
    levels[dim] = sumToLevel(score);
  });

  const userVector = dimensionOrder.map(dim => levelNum(levels[dim]));
  const ranked = NORMAL_TYPES.map(type => {
    const vector = parsePattern(type.pattern).map(levelNum);
    let distance = 0;
    let exact = 0;
    for (let i = 0; i < vector.length; i++) {
      const diff = Math.abs(userVector[i] - vector[i]);
      distance += diff;
      if (diff === 0) exact += 1;
    }
    const similarity = Math.max(0, Math.round((1 - distance / 30) * 100));
    return { ...type, ...TYPE_LIBRARY[type.code], distance, exact, similarity };
  }).sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (b.exact !== a.exact) return b.exact - a.exact;
    return b.similarity - a.similarity;
  });

  const bestNormal = ranked[0];
  const drunkTriggered = answers[DRUNK_TRIGGER_QUESTION_ID] === 2;

  let finalType;
  let modeKicker = '你的主类型';
  let badge = `匹配度 ${bestNormal.similarity}% · 精准命中 ${bestNormal.exact}/15 维`;
  let sub = '维度命中度较高，当前结果可视为你的第一人格画像。';
  let special = false;

  if (drunkTriggered) {
    finalType = TYPE_LIBRARY.DRUNK;
    modeKicker = '隐藏人格已激活';
    badge = '匹配度 100% · 酒精异常因子已接管';
    sub = '乙醇亲和性过强，系统已直接跳过常规人格审判。';
    special = true;
  } else if (bestNormal.similarity < 60) {
    finalType = TYPE_LIBRARY.HHHH;
    modeKicker = '系统强制兜底';
    badge = `标准人格库最高匹配仅 ${bestNormal.similarity}%`;
    sub = '标准人格库对你的脑回路集体罢工了，于是系统把你强制分配给了 HHHH。';
    special = true;
  } else {
    finalType = bestNormal;
  }

  return { rawScores, levels, finalType, modeKicker, badge, sub, special };
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);
  const [pairA, setPairA] = useState('');
  const [pairB, setPairB] = useState('');

  const startTest = useCallback(() => {
    setAnswers({});
    const shuffledRegular = shuffle(questions);
    const insertIndex = Math.floor(Math.random() * shuffledRegular.length) + 1;
    setShuffledQuestions([
      ...shuffledRegular.slice(0, insertIndex),
      specialQuestions[0],
      ...shuffledRegular.slice(insertIndex),
    ]);
    setScreen('test');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const visibleQuestions = useMemo(() => {
    const visible = [...shuffledQuestions];
    const gateIndex = visible.findIndex(q => q.id === 'drink_gate_q1');
    if (gateIndex !== -1 && answers['drink_gate_q1'] === 3) {
      visible.splice(gateIndex + 1, 0, specialQuestions[1]);
    }
    return visible;
  }, [shuffledQuestions, answers]);

  const answeredCount = visibleQuestions.filter(q => answers[q.id] !== undefined).length;
  const totalCount = visibleQuestions.length;
  const allAnswered = answeredCount === totalCount && totalCount > 0;
  const progressPercent = totalCount ? (answeredCount / totalCount) * 100 : 0;

  const handleAnswer = useCallback((questionId: string, value: number) => {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: value };
      if (questionId === 'drink_gate_q1' && value !== 3) {
        delete next['drink_gate_q2'];
      }
      return next;
    });
  }, []);

  const result = useMemo(() => {
    if (screen !== 'result') return null;
    return computeResult(answers);
  }, [screen, answers]);

  const showResult = useCallback(() => {
    setScreen('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goHome = useCallback(() => {
    setScreen('intro');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToPairing = useCallback(() => {
    setPairA('');
    setPairB('');
    setScreen('pairing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const pairingText = useMemo(() => {
    if (!pairA || !pairB) return null;
    return getPairingText(pairA, pairB);
  }, [pairA, pairB]);

  const saveScreenshot = useCallback(async () => {
    if (!resultRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(resultRef.current, {
      backgroundColor: '#f6faf6',
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement('a');
    link.download = 'SBTI-结果.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const shareTest = useCallback(async () => {
    if (!result) return;
    const text = `我在SBTI人格测试中测出了「${result.finalType.code}（${result.finalType.cn}）」，你是什么？`;
    const url = 'https://sbti.ca';
    if (navigator.share) {
      try {
        await navigator.share({ title: 'SBTI 人格测试', text, url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert('已复制到剪贴板');
    }
  }, [result]);

  return (
    <div className="shell">
      {/* Intro Screen */}
      {screen === 'intro' && (
        <section>
          <div className="hero card hero-minimal">
            <h1>MBTI已经过时，SBTI来了。</h1>
            <div className="hero-actions hero-actions-single">
              <button className="btn-primary" onClick={startTest}>开始测试</button>
              <button className="btn-secondary" onClick={goToPairing}>性格配对</button>
            </div>
            <div className="credits">
              <span>
                开发：<a href="https://orangechat.ai">orangechat.ai</a>
              </span>
              <span>
                原创内容：<a href="https://space.bilibili.com/417038183">B站@蛆肉儿串儿</a>
              </span>
              <span>域名：sbti.ca</span>
            </div>
          </div>
        </section>
      )}

      {/* Test Screen */}
      {screen === 'test' && (
        <section>
          <div className="test-wrap card">
            <div className="topbar">
              <div className="progress">
                <span className="progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="progress-text">{answeredCount} / {totalCount}</div>
            </div>

            <div className="question-list">
              {visibleQuestions.map((q, index) => (
                <article key={q.id} className="question">
                  <div className="question-meta">
                    <div className="badge">第 {index + 1} 题</div>
                    <div>{q.special ? '补充题' : '维度已隐藏'}</div>
                  </div>
                  <div className="question-title">{q.text}</div>
                  <div className="options">
                    {q.options.map((opt, i) => {
                      const code = ['A', 'B', 'C', 'D'][i] || String(i + 1);
                      return (
                        <label key={i} className="option">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt.value}
                            checked={answers[q.id] === opt.value}
                            onChange={() => handleAnswer(q.id, opt.value)}
                          />
                          <div className="option-code">{code}</div>
                          <div>{opt.label}</div>
                        </label>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>

            <div className="actions-bottom">
              <div className="hint">
                {allAnswered
                  ? '都做完了。现在可以把你的电子魂魄交给结果页审判。'
                  : '全选完才会放行。世界已经够乱了，起码把题做完整。'}
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={goHome}>返回首页</button>
                <button className="btn-primary" disabled={!allAnswered} onClick={showResult}>
                  提交并查看结果
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Pairing Screen */}
      {screen === 'pairing' && (
        <section>
          <div className="pairing-wrap card">
            <h2 className="pairing-title">性格配对</h2>
            <p className="pairing-subtitle">选两个性格，看看会发生什么。</p>

            <div className="pairing-selectors">
              <div className="pairing-select-group">
                <label className="pairing-label">性格 A</label>
                <div className="pairing-grid">
                  {ALL_TYPE_CODES.map(code => (
                    <button
                      key={code}
                      className={`pairing-chip${pairA === code ? ' active' : ''}`}
                      onClick={() => setPairA(prev => prev === code ? '' : code)}
                    >
                      {TYPE_IMAGES[code] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="pairing-chip-img" src={TYPE_IMAGES[code]} alt="" />
                      )}
                      <span className="pairing-chip-code">{code}</span>
                      <span className="pairing-chip-cn">{TYPE_LIBRARY[code].cn}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pairing-vs">×</div>

              <div className="pairing-select-group">
                <label className="pairing-label">性格 B</label>
                <div className="pairing-grid">
                  {ALL_TYPE_CODES.map(code => (
                    <button
                      key={code}
                      className={`pairing-chip${pairB === code ? ' active' : ''}`}
                      onClick={() => setPairB(prev => prev === code ? '' : code)}
                    >
                      {TYPE_IMAGES[code] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="pairing-chip-img" src={TYPE_IMAGES[code]} alt="" />
                      )}
                      <span className="pairing-chip-code">{code}</span>
                      <span className="pairing-chip-cn">{TYPE_LIBRARY[code].cn}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {pairA && pairB && pairingText && (
              <div className="pairing-result">
                <div className="pairing-result-header">
                  <div className="pairing-result-avatars">
                    {TYPE_IMAGES[pairA] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="pairing-avatar" src={TYPE_IMAGES[pairA]} alt={pairA} />
                    )}
                    <span className="pairing-result-vs">×</span>
                    {TYPE_IMAGES[pairB] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="pairing-avatar" src={TYPE_IMAGES[pairB]} alt={pairB} />
                    )}
                  </div>
                  <div className="pairing-result-names">
                    {pairA}（{TYPE_LIBRARY[pairA].cn}） × {pairB}（{TYPE_LIBRARY[pairB].cn}）
                  </div>
                </div>
                <p className="pairing-result-text">{pairingText}</p>
              </div>
            )}

            <div className="pairing-actions">
              <button className="btn-secondary" onClick={goHome}>回到首页</button>
            </div>
          </div>
        </section>
      )}

      {/* Result Screen */}
      {screen === 'result' && result && (
        <section>
          <div className="result-wrap card" ref={resultRef}>
            <div className="result-layout">
              <div className="result-top">
                <div className={`poster-box${TYPE_IMAGES[result.finalType.code] ? '' : ' no-image'}`}>
                  {TYPE_IMAGES[result.finalType.code] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="poster-image"
                      src={TYPE_IMAGES[result.finalType.code]}
                      alt={`${result.finalType.code}（${result.finalType.cn}）`}
                    />
                  )}
                  <div className="poster-caption">{result.finalType.intro}</div>
                </div>

                <div className="type-box">
                  <div className="type-kicker">{result.modeKicker}</div>
                  <div className="type-name">{result.finalType.code}（{result.finalType.cn}）</div>
                  <div className="match">{result.badge}</div>
                  <div className="type-subname">{result.sub}</div>
                </div>
              </div>

              <div className="analysis-box">
                <h3>该人格的简单解读</h3>
                <p>{result.finalType.desc}</p>
              </div>

              <div className="dim-box">
                <h3>十五维度评分</h3>
                <div className="dim-list">
                  {dimensionOrder.map(dim => {
                    const level = result.levels[dim];
                    const explanation = DIM_EXPLANATIONS[dim][level];
                    return (
                      <div key={dim} className="dim-item">
                        <div className="dim-item-top">
                          <div className="dim-item-name">{dimensionMeta[dim].name}</div>
                          <div className="dim-item-score">{level} / {result.rawScores[dim]}分</div>
                        </div>
                        <p>{explanation}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="note-box">
                <h3>友情提示</h3>
                <p>
                  {result.special
                    ? '本测试仅供娱乐。隐藏人格和傻乐兜底都属于作者故意埋的损招，请勿把它当成医学、心理学、相学、命理学或灵异学依据。'
                    : '本测试仅供娱乐，别拿它当诊断、面试、相亲、分手、招魂、算命或人生判决书。你可以笑，但别太当真。'}
                </p>
              </div>

            </div>

            <div className="result-actions">
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={shareTest}>分享测试</button>
                <button className="btn-primary" onClick={saveScreenshot}>保存结果图片</button>
                <button className="btn-secondary" onClick={startTest}>重新测试</button>
                <button className="btn-secondary" onClick={goHome}>回到首页</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
