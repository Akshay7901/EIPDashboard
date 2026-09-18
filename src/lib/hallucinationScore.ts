// Hallucination score = the publisher integrity/acceptability score from Stage 3 of the
// AI review, assessing whether a proposal's references and citations are genuine or
// fabricated. Scale is 0-10, where higher means more trustworthy.

export interface HallucinationScoreInfo {
  label: string;
  className: string;
}

export const HALLUCINATION_SCORE_DESCRIPTION =
  'Publisher integrity score (AI review, Stage 3): checks whether the proposal\'s references and citations are genuine or fabricated. Scale 0–10, higher is more trustworthy. 10 = Acceptable, 7–9 = Conditionally Acceptable, 4–6 = Borderline, ≤3 = Not Acceptable.';

export const getHallucinationScoreInfo = (score: number): HallucinationScoreInfo => {
  if (score >= 10) return { label: 'Acceptable', className: 'text-[#16A34A]' };
  if (score >= 7) return { label: 'Conditionally Acceptable', className: 'text-[#0D9488]' };
  if (score >= 4) return { label: 'Borderline', className: 'text-[#D97706]' };
  return { label: 'Not Acceptable', className: 'text-[#DC2626]' };
};
