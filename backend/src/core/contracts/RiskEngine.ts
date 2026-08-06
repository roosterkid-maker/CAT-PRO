import type {
  RiskEvaluationInput,
} from "../../modules/risk/services/RiskManagerService";
import type {
  RiskAssessment,
} from "../../modules/risk/models/RiskAssessment";

export interface RiskEngine {
  evaluate(
    input: RiskEvaluationInput,
  ): RiskAssessment;
}