import React, { useState, useEffect, useRef } from 'react';
import { QuizLayout } from './App';
import './EquationCraftingLab.css';

export default function EquationCraftingLab({ onBack }) {
  const [difficulty, setDifficulty] = useState(0); // 0: Easy, 1: Medium-Linear, 2: Hard-Factored, 3: Expert-Quadratic
  const [phase, setPhase] = useState('setup'); // 'setup' | 'playing' | 'finished'
  const [questionCount, setQuestionCount] = useState(10);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);

  // Game states
  const [target, setTarget] = useState('');
  const [reagents, setReagents] = useState([]);
  const [crucible, setCrucible] = useState([]); // List of current blocks in the crucible: { id, label, expr }
  const [selectedIds, setSelectedIds] = useState([]); // Selected blocks in the crucible
  const [selectedCatalyst, setSelectedCatalyst] = useState(null); // Selected operator

  const [revealed, setRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [submittedLabel, setSubmittedLabel] = useState('');

  // Auto-select when there are exactly 2 blocks in the crucible
  useEffect(() => {
    if (crucible.length === 2) {
      setSelectedIds([crucible[0].id, crucible[1].id]);
    }
  }, [crucible]);
  const [startTime, setStartTime] = useState(null);

  const [autoCountdown, setAutoCountdown] = useState(null);
  const autoTimerRef = useRef(null);

  const diffLabels = [
    'Level 1: Basic Math (Only Numbers)',
    'Level 2: Simple Algebra (With x)',
    'Level 3: Using Brackets',
    'Level 4: Double Brackets',
    'Level 5: Quadratic Form',
    'Level 6: Rational Fractions',
    'Level 7: Cubic Form',
    'Level 8: Nested Factoring',
    'Level 9: Higher Powers & Squares',
    'Level 10: Algebraic Identities'
  ];

  // Load a new question
  const fetchQuestion = async () => {
    setLoading(true);
    setRevealed(false);
    setSelectedIds([]);
    setSelectedCatalyst(null);
    setFeedback('');

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/alchemy-api/question?difficulty=${difficulty}`);
      const data = await response.json();

      setTarget(data.target);
      setReagents(data.reagents);

      // Initialize the crucible with the raw reagents
      const initialCrucible = data.reagents
        .filter(r => !['+', '-', '*', '/', '(', ')'].includes(r))
        .map((r, idx) => ({
          id: `reagent-${idx}-${Date.now()}`,
          label: r,
          expr: r
        }));
      setCrucible(initialCrucible);
      setStartTime(Date.now());
    } catch (err) {
      console.error('Error fetching question:', err);
      setFeedback('Error loading ingredients from the guild repository.');
    } finally {
      setLoading(false);
    }
  };

  // Start the game session
  const startGame = () => {
    setPhase('playing');
    setCurrentQuestion(0);
    setScore(0);
    setResults([]);
    fetchQuestion();
  };

  // Drag and drop or click selection logic
  const handleBlockClick = (id) => {
    if (revealed) return;
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      if (selectedIds.length < 2) {
        setSelectedIds([...selectedIds, id]);
      } else {
        // Keep it capped at 2 selections
        setSelectedIds([selectedIds[1], id]);
      }
    }
  };

  const handleCatalystClick = (op) => {
    if (revealed) return;
    setSelectedCatalyst(selectedCatalyst === op ? null : op);
  };

  // Fuse the selected blocks in the crucible using the selected catalyst
  const handleFuse = () => {
    if (selectedIds.length !== 2 || !selectedCatalyst) return;

    const block1 = crucible.find(b => b.id === selectedIds[0]);
    const block2 = crucible.find(b => b.id === selectedIds[1]);

    if (!block1 || !block2) return;

    // Create new fused node
    const fusedLabel = `(${block1.label} ${selectedCatalyst} ${block2.label})`;
    const fusedExpr = `(${block1.expr}${selectedCatalyst}${block2.expr})`;

    const newBlock = {
      id: `fused-${Date.now()}`,
      label: fusedLabel,
      expr: fusedExpr
    };

    // Replace combined blocks
    const nextCrucible = crucible.filter(b => b.id !== block1.id && b.id !== block2.id);
    setCrucible([...nextCrucible, newBlock]);
    setSelectedIds([]);
    setSelectedCatalyst(null);
  };

  // Reset the crucible back to its initial reagents
  const handleResetCrucible = () => {
    if (revealed) return;
    const initialCrucible = reagents
      .filter(r => !['+', '-', '*', '/', '(', ')'].includes(r))
      .map((r, idx) => ({
        id: `reagent-${idx}-${Date.now()}`,
        label: r,
        expr: r
      }));
    setCrucible(initialCrucible);
    setSelectedIds([]);
    setSelectedCatalyst(null);
  };

  // Submit the potion for verification
  const handleSubmit = async () => {
    if (crucible.length === 0 || revealed) return;

    // The final expression is either the single block left, or we concatenate whatever is left (though ideally they combine down to 1)
    let userExpr = '';
    let userLabel = '';
    if (crucible.length === 1) {
      userExpr = crucible[0].expr;
      userLabel = crucible[0].label;
    } else {
      setFeedback('Error: Potion must be fully fused into a single compound before testing.');
      return;
    }

    setSubmittedLabel(userLabel);
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/alchemy-api/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userExpression: userExpr, target })
      });
      const data = await response.json();

      const correct = data.correct;
      setIsCorrect(correct);
      setRevealed(true);

      if (correct) {
        setScore(prev => prev + 1);
        setFeedback('Correct! The formula is mathematically equivalent to the target compound!');

        // Auto-advance configuration
        let sec = 4;
        setAutoCountdown(sec);
        autoTimerRef.current = setInterval(() => {
          sec -= 1;
          if (sec <= 0) {
            clearInterval(autoTimerRef.current);
            handleNextQuestion();
          } else {
            setAutoCountdown(sec);
          }
        }, 1000);
      } else {
        setFeedback('Failed! The properties of your brewed compound do not match the target.');
      }

      // Save results
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      setResults(prev => [
        ...prev,
        {
          question: `Target: ${target}`,
          userAnswer: userExpr,
          correctAnswer: target,
          isCorrect: correct,
          time: elapsed
        }
      ]);
    } catch (err) {
      console.error('Error checking answer:', err);
      setFeedback('Error connecting to the alchemical evaluation server.');
    } finally {
      setLoading(false);
    }
  };

  // Clean countdown and advance
  const handleNextQuestion = () => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
    }
    setAutoCountdown(null);

    if (currentQuestion + 1 >= questionCount) {
      setPhase('finished');
    } else {
      setCurrentQuestion(prev => prev + 1);
      fetchQuestion();
    }
  };

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, []);

  return (
    <div className="alchemy-lab-container">
      {phase === 'setup' && (
        <div style={{ minHeight: '100vh', background: 'var(--clr-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Inter, sans-serif' }}>
          <div style={{
            background: 'var(--clr-card)', border: '1.5px solid var(--clr-border)', borderRadius: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,.45)', padding: '32px 40px 48px', maxWidth: '720px', width: '100%',
            textAlign: 'center'
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
              <button onClick={onBack} style={{
                background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '8px',
                padding: '8px 16px', color: 'var(--clr-text-soft)', fontFamily: 'Inter, sans-serif',
                fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', boxShadow: 'rgba(0, 0, 0, 0.2) 0px 2px 6px',
                display: 'inline-flex', alignItems: 'center', gap: '6px'
              }}>
                ← Home
              </button>
            </div>

            <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '44px', color: 'var(--clr-text)', margin: '0 0 12px', lineHeight: 1.1 }}>
              Equation Crafting Lab
            </h1>
            <p style={{ color: 'var(--clr-text-soft)', fontSize: '0.9rem', margin: '0 0 24px', fontFamily: 'Inter, sans-serif', fontWeight: 400 }}>
              Craft the target mathematical expression by putting variables and operators in the mixing pot!
            </p>

            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: 'var(--clr-text)', fontSize: '0.9rem', margin: '0 0 16px', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
                Select Difficulty:
              </h3>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                {diffLabels.map((lbl, idx) => (
                  <button key={idx} onClick={() => setDifficulty(idx)} style={{
                    background: difficulty === idx ? 'var(--clr-accent)' : 'transparent',
                    border: difficulty === idx ? '1.5px solid var(--clr-accent)' : '1px solid var(--clr-border)',
                    borderRadius: '50px', padding: '8px 16px',
                    color: difficulty === idx ? '#FFF' : 'var(--clr-text-soft)', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                  }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <label style={{ color: 'var(--clr-text-soft)', fontSize: '0.85rem', margin: '0 0 12px', fontFamily: 'Inter, sans-serif', fontWeight: 400 }}>
                How many questions? (max 100)
              </label>
              <input type="text" value={questionCount} onChange={(e) => { const v = e.target.value; if (v === '' || (/^\d+$/.test(v) && Number(v) <= 100)) setQuestionCount(v === '' ? '' : Number(v)) }} style={{
                background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '6px',
                padding: '10px', color: 'var(--clr-text)', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem',
                width: '100px', textAlign: 'center', outline: 'none'
              }} placeholder="5" />
            </div>

            <button onClick={startGame} style={{
              background: 'var(--clr-accent)', border: 'none', borderRadius: '6px',
              padding: '10px 24px', color: '#FFF', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
            }}>
              Start Lab
            </button>
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <QuizLayout
          title=""
          onBack={() => {
            if (autoTimerRef.current) clearInterval(autoTimerRef.current);
            setPhase('setup');
          }}
          backLabel="Menu"
        >
          <div className="gameplay-area">
            {/* The Target Compound Container */}
            <div className="alchemy-card target-card">
              <span className="target-label">Target Expression to Create:</span>
              <h2 className="target-math">{target}</h2>
            </div>

            {/* The Crucible Pot */}
            <div className="crucible-pot-wrapper">
              <h3 className="crucible-header">Your Mixing Pot (Crucible)</h3>
              <div className="crucible-inner">
                {crucible.length === 0 ? (
                  <p className="empty-pot-msg">Click elements below to add them to your mixing pot...</p>
                ) : (
                  <div className="crucible-blocks-grid">
                    {crucible.map(block => (
                      <div
                        key={block.id}
                        className={`crucible-block ${selectedIds.includes(block.id) ? 'selected' : ''}`}
                        onClick={() => handleBlockClick(block.id)}
                      >
                        <span className="block-label">{block.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Catalyst Action Bar */}
            <div className="alchemy-card catalysts-card">
              <h3>⚡ Choose an Operator (+, -, ×, ÷):</h3>
              <div className="catalyst-buttons">
                {['+', '-', '*', '/'].map(op => (
                  <button
                    key={op}
                    className={`catalyst-btn ${selectedCatalyst === op ? 'active' : ''}`}
                    onClick={() => handleCatalystClick(op)}
                    disabled={revealed}
                  >
                    {op === '*' ? '×' : op === '/' ? '÷' : op}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Triggers */}
            <div className="alchemy-actions">
              {crucible.length === 1 ? (
                <button
                  className="btn btn-success"
                  onClick={handleSubmit}
                  disabled={revealed}
                  style={{ animation: 'fadeIn 0.2s ease-out' }}
                >
                  🧪 Submit Answer
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleFuse}
                  disabled={selectedIds.length !== 2 || !selectedCatalyst || revealed}
                >
                  💥 Combine Selected Elements
                </button>
              )}

              <button
                className="btn btn-outline"
                onClick={handleResetCrucible}
                disabled={revealed}
              >
                🔄 Start Over
              </button>
            </div>

            {/* Feedback & Progression UI */}
            {revealed && (
              <div className="alchemy-feedback-box">
                <div className={`feedback-badge ${isCorrect ? 'correct' : 'wrong'}`}>
                  {isCorrect ? '🎉 Correct!' : '❌ Try Again!'}
                </div>
                <p className="feedback-text">{feedback}</p>

                {/* Comparison Details */}
                {!isCorrect && (
                  <div style={{ marginTop: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '12px', border: '1px solid #5B5048' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#988D84', fontSize: '0.85rem' }}>Target:</span>
                      <strong style={{ color: '#FFF' }}>{target}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#988D84', fontSize: '0.85rem' }}>Your Formula:</span>
                      <strong style={{ color: '#e74c3c' }}>{submittedLabel}</strong>
                    </div>
                  </div>
                )}

                <div className="next-action-row">
                  <button className="btn btn-primary" onClick={handleNextQuestion}>
                    {autoCountdown !== null ? `Next Question (${autoCountdown}s)` : 'Next Question'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </QuizLayout>
      )}

      {phase === 'finished' && (
        <div style={{ minHeight: '100vh', background: 'var(--clr-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Inter, sans-serif' }}>
          <div style={{
            background: 'var(--clr-card)', border: '1.5px solid var(--clr-border)', borderRadius: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,.45)', padding: '48px 40px', maxWidth: '720px', width: '100%',
            textAlign: 'center', position: 'relative'
          }}>
            <h1 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '48px', color: 'var(--clr-text)', margin: '0 0 12px', lineHeight: 1.1 }}>
              🏆 Lab Session Completed
            </h1>
            <p style={{ color: 'var(--clr-text-soft)', fontSize: '0.9rem', margin: '0 0 24px', fontFamily: 'Inter, sans-serif', fontWeight: 400 }}>
              You have successfully completed this algebra crafting session!
            </p>

            <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '12px', padding: '20px', display: 'inline-block', marginBottom: '24px' }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--clr-accent)' }}>{score} / {questionCount}</div>
              <div style={{ color: 'var(--clr-text-soft)', fontSize: '0.85rem', marginTop: '4px', fontWeight: 600 }}>Questions Correct</div>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '24px', border: '1px solid var(--clr-border)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--clr-text)', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--clr-surface)', borderBottom: '1px solid var(--clr-border)' }}>
                    <th style={{ padding: '10px' }}>Target Expression</th>
                    <th style={{ padding: '10px' }}>Your Answer</th>
                    <th style={{ padding: '10px' }}>Status</th>
                    <th style={{ padding: '10px' }}>Time Taken</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--clr-border)', background: r.isCorrect ? 'var(--clr-correct-bg)' : 'var(--clr-wrong-bg)' }}>
                      <td style={{ padding: '10px' }}><code>{r.correctAnswer}</code></td>
                      <td style={{ padding: '10px' }}><code>{r.userAnswer}</code></td>
                      <td style={{ padding: '10px', color: r.isCorrect ? 'var(--clr-correct)' : 'var(--clr-wrong)', fontWeight: 600 }}>{r.isCorrect ? '✓ Correct' : '✗ Incorrect'}</td>
                      <td style={{ padding: '10px' }}>{r.time}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={startGame} style={{
                background: 'var(--clr-accent)', border: 'none', borderRadius: '6px',
                padding: '10px 24px', color: '#FFF', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
              }}>
                Try Again
              </button>
              <button onClick={() => setPhase('setup')} style={{
                background: 'transparent', border: '1px solid var(--clr-border)', borderRadius: '6px',
                padding: '10px 24px', color: 'var(--clr-text-soft)', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
              }}>
                Change Level
              </button>
              <button onClick={onBack} style={{
                background: 'transparent', border: '1px solid var(--clr-border)', borderRadius: '6px',
                padding: '10px 24px', color: 'var(--clr-text-soft)', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
              }}>
                Exit Lab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
