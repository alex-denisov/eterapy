import { sessionCounter } from '@/lib/session-counter';

// Mock window and localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('sessionCounter', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('get()', () => {
    it('should return current month and zero count when localStorage is empty', () => {
      const now = new Date();
      const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const result = sessionCounter.get();

      expect(result.month).toBe(expectedMonth);
      expect(result.count).toBe(0);
    });

    it('should return stored data when localStorage has valid data for current month', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-04',
        count: 2,
      }));

      const result = sessionCounter.get();

      expect(result).toEqual({ month: '2026-04', count: 2 });
    });

    it('should reset count when month changes', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-03',
        count: 5,
      }));

      const now = new Date(2026, 3, 1); // April 2026
      jest.spyOn(global, 'Date').mockImplementation(() => now as unknown as string);

      const result = sessionCounter.get();

      expect(result.month).toBe('2026-04');
      expect(result.count).toBe(0);
    });

    it('should handle corrupted JSON in localStorage', () => {
      localStorageMock.setItem('eterapy_tool_usage', 'not valid json{');

      const result = sessionCounter.get();

      expect(result.count).toBe(0);
    });
  });

  describe('getRemaining()', () => {
    it('should return limit when count is 0', () => {
      const result = sessionCounter.getRemaining();
      expect(result).toBe(3);
    });

    it('should return LIMIT - count when some uses consumed', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-04',
        count: 1,
      }));

      const result = sessionCounter.getRemaining();
      expect(result).toBe(2);
    });

    it('should return 0 when limit reached', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-04',
        count: 3,
      }));

      const result = sessionCounter.getRemaining();
      expect(result).toBe(0);
    });

    it('should not return negative numbers', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-04',
        count: 5,
      }));

      const result = sessionCounter.getRemaining();
      expect(result).toBe(0);
    });
  });

  describe('increment()', () => {
    it('should return true and increment count when under limit', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-04',
        count: 1,
      }));

      const result = sessionCounter.increment();

      expect(result).toBe(true);
      const stored = JSON.parse(localStorageMock.getItem('eterapy_tool_usage')!);
      expect(stored.count).toBe(2);
    });

    it('should return false when limit already reached', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-04',
        count: 3,
      }));

      const result = sessionCounter.increment();

      expect(result).toBe(false);
      const stored = JSON.parse(localStorageMock.getItem('eterapy_tool_usage')!);
      expect(stored.count).toBe(3); // unchanged
    });

    it('should not increment when exactly at limit', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2026-04',
        count: 3,
      }));

      sessionCounter.increment();
      const stored = JSON.parse(localStorageMock.getItem('eterapy_tool_usage')!);

      expect(stored.count).toBe(3);
    });

    it('should create new entry when none exists', () => {
      const result = sessionCounter.increment();

      expect(result).toBe(true);
      const stored = JSON.parse(localStorageMock.getItem('eterapy_tool_usage')!);
      expect(stored.count).toBe(1);
      expect(stored.month).toBeTruthy();
    });

    it('should increment from 0 to 1 on first use', () => {
      const result = sessionCounter.increment();

      expect(result).toBe(true);
      const stored = JSON.parse(localStorageMock.getItem('eterapy_tool_usage')!);
      expect(stored.count).toBe(1);
    });

    it('should allow multiple increments up to limit', () => {
      for (let i = 0; i < 3; i++) {
        expect(sessionCounter.increment()).toBe(true);
      }
      const stored = JSON.parse(localStorageMock.getItem('eterapy_tool_usage')!);
      expect(stored.count).toBe(3);
    });

    it('should persist between calls', () => {
      sessionCounter.increment();
      sessionCounter.increment();

      const result = sessionCounter.increment();
      expect(result).toBe(true); // third reaches the limit

      const stored = JSON.parse(localStorageMock.getItem('eterapy_tool_usage')!);
      expect(stored.count).toBe(3);
    });
  });

  describe('limit constant', () => {
    it('should have limit of 3', () => {
      expect(sessionCounter.limit).toBe(3);
    });

    it('should respect limit in getRemaining and increment', () => {
      expect(sessionCounter.limit).toBe(3);

      // Fill up to limit
      sessionCounter.increment();
      sessionCounter.increment();
      sessionCounter.increment();

      expect(sessionCounter.getRemaining()).toBe(0);
      expect(sessionCounter.increment()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle SSR (server-side rendering)', () => {
      // In Node.js window is undefined
      const result = sessionCounter.get();
      expect(result.count).toBe(0);
      expect(result.month).toBeTruthy();
    });

    it('should handle leap year month boundaries', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2024-02',
        count: 2,
      }));

      // Switch to March
      jest.useFakeTimers().setSystemTime(new Date(2024, 2, 1).getTime());

      const result = sessionCounter.get();
      expect(result.month).toBe('2024-03');
      expect(result.count).toBe(0);
    });

    it('should handle year boundaries', () => {
      localStorageMock.setItem('eterapy_tool_usage', JSON.stringify({
        month: '2025-12',
        count: 1,
      }));

      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1).getTime());

      const result = sessionCounter.get();
      expect(result.month).toBe('2026-01');
      expect(result.count).toBe(0);
    });
  });
});
