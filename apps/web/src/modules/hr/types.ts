export type Employee = {
  id: string;
  number: string;
  name: string;
  unitId: string;
  positionId: string | null;
  contractType: 'PERMANENT' | 'FIXED_TERM' | 'OTHER';
  hireDate: string;
  contractEndDate: string | null;
  terminationDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthDate: string | null;
  vacationDaysPerYear: number | null;
  active: boolean;
  // sensíveis (só com hr.sensitive)
  baseSalary?: number | null;
  nif?: string | null;
  idNumber?: string | null;
  socialSecurityNo?: string | null;
  bankName?: string | null;
  iban?: string | null;
  allowances?: { name: string; amount: number }[];
  documents?: {
    id: string;
    name: string;
    url: string;
    expiresAt: string | null;
    uploadedAt: string;
  }[];
  position?: { name: string } | null;
  unit?: { name: string };
};
export type Position = {
  id: string;
  name: string;
  departmentId: string | null;
  active: boolean;
  department: { name: string } | null;
};
export type Department = { id: string; name: string; active: boolean };

/** Segunda-feira da semana de uma data YYYY-MM-DD. */
export function mondayOf(d: string) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const today = () => new Date().toLocaleDateString('en-CA');
