export class QuizEngine extends EventTarget {
  constructor(questionTypes = {}) {
    super();
    this.questionTypes = new Map(Object.entries(questionTypes));
    this.reset([]);
  }
  registerQuestionType(id, handler) {
    this.questionTypes.set(id, handler);
  }
  reset(questions) {
    this.questions = [...questions];
    this.index = -1;
    this.correct = 0;
    this.wrong = 0;
    this.current = null;
  }
  next() {
    this.current = this.questions[++this.index] || null;
    this.dispatchEvent(
      new CustomEvent("question", { detail: this.snapshot() }),
    );
    return this.current;
  }
  answer(value) {
    if (!this.current) return null;
    const handler = this.questionTypes.get(this.current.questionType);
    if (!handler)
      throw new Error(`Onbekend vraagtype: ${this.current.questionType}`);
    const correct = Boolean(handler.evaluate(this.current, value));
    correct ? (this.correct += 1) : (this.wrong += 1);
    const result = { correct, answer: value, question: this.current };
    this.dispatchEvent(
      new CustomEvent("answer", { detail: { ...this.snapshot(), result } }),
    );
    return result;
  }
  snapshot() {
    return {
      current: this.current,
      index: this.index,
      total: this.questions.length,
      correct: this.correct,
      wrong: this.wrong,
    };
  }
}

export const standardQuestionTypes = {
  "map-location": {
    evaluate: (question, value) =>
      value?.featureKey === question.correctFeatureKey,
  },
  "multiple-choice": {
    evaluate: (question, value) => value === question.correctOptionId,
  },
  "text-input": {
    evaluate: (question, value) =>
      String(value).trim().toUpperCase() ===
      String(question.answer).trim().toUpperCase(),
  },
};
