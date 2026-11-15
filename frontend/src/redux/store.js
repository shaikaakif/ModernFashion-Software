import { configureStore } from '@reduxjs/toolkit';

import rootReducer from './rootReducer';
import storePersist from './storePersist';
import { DEMO_STORAGE_KEY } from './demo/demoSlice';

const AUTH_INITIAL_STATE = {
  current: {},
  isLoggedIn: false,
  isLoading: false,
  isSuccess: false,
};

const auth_state = storePersist.get('auth') ? storePersist.get('auth') : AUTH_INITIAL_STATE;

const initialState = { auth: auth_state };

const store = configureStore({
  reducer: rootReducer,
  preloadedState: initialState,
  devTools: import.meta.env.DEV,
});

if (typeof window !== 'undefined') {
  const persistDemo = () => {
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store.getState().demo));
    } catch (error) {
      console.warn('Could not save demo data to localStorage.', error);
    }
  };
  store.subscribe(persistDemo);
  persistDemo();
}

export default store;
