export const standardQuestionTypes = {
  "map-location": {
    evaluate: (question, value) =>
      (question.acceptedFeatureKeys || [question.correctFeatureKey])
        .includes(value?.featureKey),
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
