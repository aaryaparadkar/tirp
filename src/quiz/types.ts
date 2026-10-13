export interface QuizQuestion {
  id: string;
  topic: string;
  difficulty: number;
  question: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  xp: number;
  source: { title: string; url: string; chunk_id: string };
  tags: string[];
}
