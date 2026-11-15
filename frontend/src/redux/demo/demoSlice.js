import { createSlice } from '@reduxjs/toolkit';
import { createSeedData } from '@/retail/data/seed';

export const DEMO_STORAGE_KEY = 'modern_fashion_brand_hub_demo_v1';

function loadDemoData() {
  if (typeof window === 'undefined' || !window.localStorage) return createSeedData();
  try {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!stored) return createSeedData();
    const parsed = JSON.parse(stored);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.products)) return createSeedData();
    return parsed;
  } catch (error) {
    console.warn('Could not load demo data from localStorage. Starting with sample data.', error);
    return createSeedData();
  }
}

const demoSlice = createSlice({
  name: 'demo',
  initialState: loadDemoData(),
  reducers: {
    replaceAll: (state, action) => action.payload,
    resetData: () => createSeedData(),
  },
});

export const demoActions = demoSlice.actions;
export const selectDemo = (state) => state.demo;
export default demoSlice.reducer;
