export class QuizEngine extends EventTarget {
  constructor(questionTypes = {}, { randomize = Math.random } = {}) {
    super();
    this.questionTypes = new Map();
    this.randomize = randomize;
    Object.entries(questionTypes).forEach(([id, handler]) =>
      this.registerQuestionType(id, handler),
    );
    this.reset([]);
  }

  registerQuestionType(id, handler) {
    if (!id || typeof handler?.evaluate !== "function") {
      throw new TypeError("Een vraagtype heeft een id en evaluate-functie nodig.");
    }
    this.questionTypes.set(id, handler);
    return this;
  }

  reset(questions, { shuffle = true } = {}) {
    this.questions = [...questions];
    this.queue = shuffle ? this.#shuffle(this.questions) : [...this.questions];
    this.current = null;
    this.answered = false;
    this.correct = 0;
    this.wrong = 0;
    this.streak = 0;
    this.incorrectQuestions = [];
    this.#emit("reset");
    return this.snapshot();
  }

  next() {
    if (this.current && !this.answered) return this.current;
    this.current = this.queue.shift() || null;
    this.answered = false;
    this.#emit(this.current ? "question" : "complete");
    return this.current;
  }

  answer(value) {
    if (!this.current || this.answered) return null;
    const handler = this.questionTypes.get(this.current.questionType);
    if (!handler) {
      throw new Error(`Onbekend vraagtype: ${this.current.questionType}`);
    }

    const correct = Boolean(handler.evaluate(this.current, value));
    this.answered = true;
    if (correct) {
      this.correct += 1;
      this.streak += 1;
    } else {
      this.wrong += 1;
      this.streak = 0;
      this.#rememberIncorrect(this.current);
    }

    const result = { correct, answer: value, question: this.current, revealed: false };
    this.#emit("answer", { result });
    return result;
  }

  reveal() {
    if (!this.current || this.answered) return null;
    this.answered = true;
    this.wrong += 1;
    this.streak = 0;
    this.#rememberIncorrect(this.current);
    const result = { correct: false, answer: null, question: this.current, revealed: true };
    this.#emit("answer", { result });
    return result;
  }

  retryIncorrect({ shuffle = true } = {}) {
    const questions = [...this.incorrectQuestions];
    return this.reset(questions, { shuffle });
  }

  snapshot() {
    return {
      current: this.current,
      total: this.questions.length,
      remaining: this.queue.length,
      answered: this.answered,
      correct: this.correct,
      wrong: this.wrong,
      streak: this.streak,
      incorrectQuestions: [...this.incorrectQuestions],
      complete: !this.current && this.queue.length === 0,
    };
  }

  #rememberIncorrect(question) {
    if (!this.incorrectQuestions.includes(question)) {
      this.incorrectQuestions.push(question);
    }
  }

  #shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(this.randomize() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  #emit(type, extra = {}) {
    this.dispatchEvent(
      new CustomEvent(type, { detail: { ...this.snapshot(), ...extra } }),
    );
  }
}
