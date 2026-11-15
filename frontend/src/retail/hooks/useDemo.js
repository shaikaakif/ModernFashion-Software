import { useSelector } from 'react-redux';
import { selectDemo } from '@/redux/demo/demoSlice';

export function useDemo() {
  const db = useSelector(selectDemo);
  return { db };
}

export default useDemo;
