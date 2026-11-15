import { getDashboardMetrics } from '@/retail/utils/metrics';

export const dashboardService = {
  metrics: (db) => getDashboardMetrics(db),
};
