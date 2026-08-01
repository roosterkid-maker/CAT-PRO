export interface ScoreComponent {
  name: string;

  score: number;

  weight: number;
}

export class ScoreCalculator {
  calculate(
    components: ScoreComponent[],
  ): number {
    if (components.length === 0) {
      return 0;
    }

    let totalWeight = 0;
    let weightedScore = 0;

    for (const component of components) {
      const weight = Math.max(
        0,
        component.weight,
      );

      const score = Math.max(
        0,
        Math.min(
          100,
          component.score,
        ),
      );

      weightedScore +=
        score * weight;

      totalWeight += weight;
    }

    if (totalWeight <= 0) {
      return 0;
    }

    return Math.round(
      weightedScore / totalWeight,
    );
  }
}

export const scoreCalculator =
  new ScoreCalculator();