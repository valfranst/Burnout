export interface User {
  id: number;
  email: string;
  name?: string;
  pictureUrl?: string;
}

export interface BurnoutLogRequest {
  dayType: string;
  workHours: number;
  screenTimeHours: number;
  meetingsCount: number;
  appSwitches: number;
  afterHoursWork: boolean;
  sleepHours: number;
  isolationIndex: number;
  fatigueScore: number;
  breaksTaken: number;
  taskCompletion?: number;
  dataRegistro?: string;
}

export interface BurnoutLogResponse {
  logId: number;
  burnoutId: number;
  burnoutScore: number;
  burnoutRisk: string;
  archetype?: string;
  modelUsed: boolean;
  registrationDate: string;
}

export interface WeeklyAverage {
  week: string;
  avg: number;
}

export interface TemporalTrend {
  weeklyAverages: WeeklyAverage[];
  trend: 'improving' | 'stable' | 'worsening';
  delta: number;
}

export interface AnomalyRecord {
  createdAt: string;
  fatigueScore: number;
  zscore: number;
}

export interface InterventionAnalysis {
  avgScoreAfterHighBreakDay: number;
  avgScoreAfterLowBreakDay: number;
  interventionEffect: number;
  effective: boolean;
}

export interface LatestRecord {
  createdAt: string;
  burnoutScore?: number;
  burnoutRisk?: string;
  archetype?: string;
  fatigueScore: number;
  workHours: number;
}

export interface DashboardSummary {
  totalRecords: number;
  avgBurnoutScore?: number;
  riskDistribution: Record<string, number>;
  dominantArchetype?: string;
}

export interface DashboardData {
  user: User;
  summary: DashboardSummary;
  lastRecord?: LatestRecord;
  latestRecords: LatestRecord[];
  temporal: TemporalTrend;
  anomalies: AnomalyRecord[];
  interventions?: InterventionAnalysis;
  similarRecords: unknown[];
}

export interface TrainingRecord {
  dayType: string;
  workHours: number;
  screenTimeHours: number;
  meetingsCount: number;
  appSwitches: number;
  afterHoursWork: boolean;
  sleepHours: number;
  isolationIndex: number;
  fatigueScore: number;
  breaksTaken: number;
  taskCompletion: number;
  burnoutScore: number;
  burnoutRisk: string;
  archetype?: string;
}

export interface PublicReport {
  burnoutByDayOfWeek: { dayOfWeek: string; avgBurnoutScore: number; totalRecords: number }[];
  riskDistribution: { burnoutRisk: string; total: number; percentage: number }[];
  archetypeDistribution: { archetype: string; total: number; percentage: number }[];
  overall: {
    avgBurnoutScore?: number;
    avgFatigueScore?: number;
    avgWorkHours?: number;
    avgSleepHours?: number;
    totalUsers: number;
    totalRecords: number;
  };
  trend30Days: { dataRegistro: string; avgBurnoutScore: number; totalRecords: number }[];
}
