export type ContactInsert = {
  name: string;
  notes?: string;
  tags?: string[];
  user_id: string;
};

export type CsvRow = Record<string, string | undefined>;