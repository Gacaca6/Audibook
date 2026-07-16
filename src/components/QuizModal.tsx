import { useState, useEffect } from "react";
import { Chapter, QuizQuestion } from "../types";
import { X, Check, AlertCircle, Award, Volume2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AubiMascot from "./AubiMascot";

interface QuizModalProps {
  chapter: Chapter;
  onClose: () => void;
  onCompleteQuiz: (xpEarned: number) => void;
}

export default function QuizModal({ chapter, onClose, onCompleteQuiz }: QuizModalProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const questions = chapter.quiz;
  const currentQuestion = questions[currentQuestionIndex];

  // Synthesize game sound effects offline using Web AudioContext
  const playSound = (type: "correct" | "incorrect" | "victory") => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "correct") {
        // High-pitched cheerful double tone (C5 -> E5)
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === "incorrect") {
        // Low buzzing sliding tone
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === "victory") {
        // Star arpeggio fanfare (C5 -> E5 -> G5 -> C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        osc.type = "triangle";
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();

        notes.forEach((freq, idx) => {
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        });

        gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
        osc.stop(ctx.currentTime + 0.7);
      }
    } catch (err) {
      console.log("AudioContext failed to initialize (muted/not allowed)", err);
    }
  };

  const handleOptionSelect = (idx: number) => {
    if (isAnswerChecked) return;
    setSelectedOptionIndex(idx);
  };

  const checkAnswer = () => {
    if (selectedOptionIndex === null || isAnswerChecked) return;

    const correctIndex = currentQuestion.correctOptionIndex;
    const isAnsCorrect = selectedOptionIndex === correctIndex;

    setIsCorrect(isAnsCorrect);
    setIsAnswerChecked(true);

    if (isAnsCorrect) {
      setCorrectAnswersCount((prev) => prev + 1);
      playSound("correct");
    } else {
      playSound("incorrect");
    }
  };

  const handleContinue = () => {
    setSelectedOptionIndex(null);
    setIsAnswerChecked(false);

    if (currentQuestionIndex + 1 < questions.length) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setIsFinished(true);
      playSound("victory");
    }
  };

  // XP calculation
  const baseXP = 30; // base reward
  const bonusXP = correctAnswersCount * 10; // +10 XP per correct answer
  const totalXP = baseXP + bonusXP;

  const handleClaimReward = () => {
    onCompleteQuiz(totalXP);
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col pt-12" id="quiz-modal-view">
      {/* Quiz Progress Header (iOS/Duolingo style) */}
      <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-gray-100">
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Progress Bar Container */}
        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative border border-gray-200/50">
          <div
            className="h-full bg-[#58CC02] rounded-full transition-all duration-300"
            style={{ width: `${((currentQuestionIndex + (isAnswerChecked ? 1 : 0)) / questions.length) * 100}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-slate-500">
            {currentQuestionIndex + 1} / {questions.length}
          </div>
        </div>

        {/* Dynamic Heart/XP tracker on right */}
        <div className="flex items-center gap-1 text-[#FF9600] font-sans font-black text-sm">
          <Sparkles className="w-4 h-4 fill-[#FF9600] animate-pulse" />
          <span>{correctAnswersCount * 10} pt</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!isFinished ? (
          /* ACTIVE QUIZ SCREEN */
          <motion.div
            key="quiz-body"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col justify-between"
          >
            {/* Question Text */}
            <div className="px-5 pt-6 pb-2 overflow-y-auto flex-1 flex flex-col gap-6">
              <div className="flex gap-4 items-center">
                <AubiMascot
                  mood={isAnswerChecked ? (isCorrect ? "happy" : "sad") : "quizzing"}
                  className="w-20 h-20 shrink-0"
                />
                <div className="bg-white border border-gray-200 rounded-2xl p-3.5 relative text-left shadow-xs">
                  {/* Speech Bubble Arrow */}
                  <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-l border-b border-gray-200 rotate-45" />
                  <p className="font-sans font-black text-[#FF9600] text-xs uppercase tracking-wide">COMPREHENSION QUEST</p>
                  <h4 className="font-display font-black text-slate-800 text-sm leading-tight mt-0.5">
                    {currentQuestion.question}
                  </h4>
                </div>
              </div>

              {/* Options Cards Shelf */}
              <div className="flex flex-col gap-3 mt-2">
                {currentQuestion.options.map((opt, idx) => {
                  const isSelected = selectedOptionIndex === idx;
                  const isCorrectAnswer = idx === currentQuestion.correctOptionIndex;
                  const showWrongMarker = isAnswerChecked && isSelected && !isCorrect;
                  const showCorrectMarker = isAnswerChecked && isCorrectAnswer;

                  return (
                    <button
                      key={idx}
                      disabled={isAnswerChecked}
                      onClick={() => handleOptionSelect(idx)}
                      className={`w-full p-4 rounded-2xl border-2 border-b-4 text-left font-sans font-black text-xs transition-all flex items-center justify-between ${
                        showCorrectMarker
                          ? "bg-green-50 border-[#58CC02] text-[#46A302]"
                          : showWrongMarker
                          ? "bg-red-50 border-red-500 text-red-700"
                          : isSelected
                          ? "bg-[#E1F5FE] border-[#1CB0F6] text-[#1CB0F6]"
                          : "bg-white border-gray-200 text-slate-600 active:border-b-2 active:translate-y-[2px]"
                      }`}
                    >
                      <div className="flex gap-3 items-center">
                        {/* Option Identifier Badge */}
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-[11px] border shrink-0 ${
                            showCorrectMarker
                              ? "bg-[#58CC02] text-white border-[#46A302]"
                              : showWrongMarker
                              ? "bg-red-500 text-white border-red-600"
                              : isSelected
                              ? "bg-[#1CB0F6] text-white border-[#1CB0F6]"
                              : "bg-slate-50 border-gray-200 text-slate-400"
                          }`}
                        >
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span>{opt}</span>
                      </div>

                      {/* Correct/Incorrect check markers */}
                      {showCorrectMarker && <Check className="w-5 h-5 text-[#58CC02]" />}
                      {showWrongMarker && <AlertCircle className="w-5 h-5 text-red-500" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Check/Correction Bottom Bar Panel */}
            <div
              className={`p-5 pb-8 border-t border-gray-200 transition-colors duration-300 ${
                isAnswerChecked
                  ? isCorrect
                    ? "bg-[#E8F5E9] border-green-200"
                    : "bg-red-50 border-red-200"
                  : "bg-white border-slate-100"
              }`}
            >
              <AnimatePresence mode="wait">
                {isAnswerChecked ? (
                  /* Correction feedback panel */
                  <motion.div
                    key="checked-bar"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="flex flex-col gap-3.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isCorrect ? (
                        <>
                          <Check className="w-5 h-5 text-[#58CC02] font-extrabold" />
                          <span className="font-sans font-black text-[#46A302] text-sm">Amazing Job! You got it.</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-red-600" />
                          <span className="font-sans font-black text-red-700 text-sm">Not quite, study closely!</span>
                        </>
                      )}
                    </div>

                    <p
                      className={`font-sans text-xs ${
                        isCorrect ? "text-green-600" : "text-red-600"
                      } leading-relaxed font-bold bg-white/40 p-3 rounded-xl border border-white/50`}
                    >
                      {currentQuestion.explanation}
                    </p>

                    <button
                      onClick={handleContinue}
                      className={`w-full py-4 rounded-2xl font-sans font-black text-sm border-b-4 text-center text-white transition-all active:border-b-0 active:translate-y-[4px] ${
                        isCorrect
                          ? "bg-[#58CC02] border-[#46A302] hover:bg-[#46A302]"
                          : "bg-red-500 border-red-700 hover:bg-red-600"
                      }`}
                    >
                      Continue
                    </button>
                  </motion.div>
                ) : (
                  /* Standard validation action bar */
                  <motion.div key="unchecked-bar" className="w-full">
                    <button
                      disabled={selectedOptionIndex === null}
                      onClick={checkAnswer}
                      className={`w-full py-4 rounded-2xl font-sans font-black text-sm border-b-4 text-center transition-all ${
                        selectedOptionIndex === null
                          ? "bg-gray-100 text-slate-400 border-gray-200 cursor-not-allowed"
                          : "bg-[#58CC02] text-white border-[#46A302] hover:bg-[#46A302] active:border-b-0 active:translate-y-[4px]"
                      }`}
                    >
                      Check Answer
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          /* SUCCESS SCREEN (Fans / Victory!) */
          <motion.div
            key="success-screen"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col justify-between p-6 text-center"
          >
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <AubiMascot mood="celebrating" className="w-48 h-48" />

              <div>
                <h3 className="font-display font-black text-slate-800 text-xl tracking-tight">
                  Quest Complete! 🎉
                </h3>
                <p className="font-sans text-sm text-slate-500 mt-2 max-w-xs mx-auto font-bold">
                  You completed the audiobook quest for <span className="font-black text-slate-700">"{chapter.title}"</span>.
                </p>
              </div>

              {/* Reward stats display */}
              <div className="grid grid-cols-2 gap-4 w-full max-w-xs mt-2">
                <div className="bg-[#E1F5FE]/55 border border-[#1CB0F6]/20 rounded-2xl p-3.5 shadow-sm">
                  <span className="text-[10px] font-black text-[#1CB0F6] uppercase tracking-widest block">XP GIFTED</span>
                  <span className="font-sans font-black text-[#1CB0F6] text-xl mt-1 block flex items-center justify-center gap-1">
                    <Sparkles className="w-5 h-5 text-[#1CB0F6] fill-[#1CB0F6]" /> +{totalXP} XP
                  </span>
                </div>

                <div className="bg-[#58CC02]/10 border border-[#58CC02]/20 rounded-2xl p-3.5 shadow-sm">
                  <span className="text-[10px] font-black text-[#58CC02] uppercase tracking-widest block">SCORE</span>
                  <span className="font-sans font-black text-[#58CC02] text-xl mt-1 block">
                    {correctAnswersCount} / {questions.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Bouncy Claim button */}
            <button
              onClick={handleClaimReward}
              className="w-full py-4.5 bg-[#58CC02] hover:bg-[#46A302] border-b-4 border-[#46A302] active:border-b-0 active:translate-y-[4px] text-white rounded-2xl font-sans font-black text-sm tracking-wide transition-all shadow-md"
            >
              Claim Rewards & Finish
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
