/* eslint-disable @typescript-eslint/no-explicit-any */
import { practitioners, SPECIALTY_LABELS } from '@/data/practitioners';

describe('Practitioners Data', () => {
  it('should have at least one practitioner', () => {
    expect(practitioners.length).toBeGreaterThan(0);
  });

  it('each practitioner should have required fields', () => {
    practitioners.forEach((p: any) => {
      expect(p.id).toBeTruthy();
      expect(typeof p.id).toBe('string');
      expect(p.name).toBeTruthy();
      expect(typeof p.name).toBe('string');
      expect(p.avatar).toBeTruthy();
      expect(typeof p.avatar).toBe('string');
      expect(p.title).toBeTruthy();
      expect(Array.isArray(p.specialties)).toBe(true);
      expect(p.specialties.length).toBeGreaterThan(0);
      expect(typeof p.rating).toBe('number');
      expect(p.rating).toBeGreaterThanOrEqual(0);
      expect(p.rating).toBeLessThanOrEqual(5);
      expect(typeof p.reviewCount).toBe('number');
      expect(typeof p.sessionCount).toBe('number');
      expect(typeof p.pricePerSession).toBe('number');
      expect(p.pricePerSession).toBeGreaterThan(0);
      expect(typeof p.bio).toBe('string');
      expect(typeof p.experience).toBe('string');
      expect(Array.isArray(p.languages)).toBe(true);
      expect(typeof p.verified).toBe('boolean');
      expect(typeof p.founding).toBe('boolean');
      expect(typeof p.online).toBe('boolean');
      expect(Array.isArray(p.tags)).toBe(true);
      expect(Array.isArray(p.reviews)).toBe(true);
    });
  });

  it('should have unique IDs', () => {
    const ids = practitioners.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid ratings between 0 and 5', () => {
    practitioners.forEach((practitioner) => {
      expect(practitioner.rating).toBeGreaterThanOrEqual(0);
      expect(practitioner.rating).toBeLessThanOrEqual(5);
    });
  });

  it('should have positive prices', () => {
    practitioners.forEach((practitioner) => {
      expect(practitioner.pricePerSession).toBeGreaterThan(0);
    });
  });

  it('each review should have valid structure', () => {
    practitioners.forEach((practitioner) => {
      const reviews = practitioner.reviews as any[];
      reviews.forEach((review: any) => {
        expect(review.author).toBeTruthy();
        expect(review.text).toBeTruthy();
        expect(typeof review.rating).toBe('number');
        expect(review.rating).toBeGreaterThanOrEqual(1);
        expect(review.rating).toBeLessThanOrEqual(5);
        expect(review.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('SPECIALTY_LABELS', () => {
    it('should have labels for all specialties', () => {
      Object.keys(SPECIALTY_LABELS).forEach((key) => {
        expect(SPECIALTY_LABELS[key as keyof typeof SPECIALTY_LABELS]).toBeTruthy();
        expect(typeof SPECIALTY_LABELS[key as keyof typeof SPECIALTY_LABELS]).toBe('string');
      });
    });

    it('should have non-empty labels', () => {
      Object.values(SPECIALTY_LABELS).forEach((label) => {
        expect(label.length).toBeGreaterThan(0);
      });
    });
  });

  describe('filtering scenarios', () => {
    it('should be able to filter by specialty "tarot"', () => {
      const tarotPractitioners = practitioners.filter((p: any) =>
        p.specialties.includes('tarot')
      );
      expect(tarotPractitioners.length).toBeGreaterThan(0);
      tarotPractitioners.forEach((practitioner) => {
        expect(practitioner.specialties).toContain('tarot');
      });
    });

    it('should be able to filter by online status', () => {
      const onlinePractitioners = practitioners.filter((p: any) => p.online);
      expect(onlinePractitioners.length).toBeGreaterThan(0);
    });

    it('should be able to filter by rating >= 4.5', () => {
      const highRatedPractitioners = practitioners.filter((p: any) => p.rating >= 4.5);
      expect(highRatedPractitioners.length).toBeGreaterThan(0);
      highRatedPractitioners.forEach((practitioner) => {
        expect(practitioner.rating).toBeGreaterThanOrEqual(4.5);
      });
    });

    it('should be able to filter by founding cohort', () => {
      const founding = practitioners.filter((p: any) => p.founding);
      expect(founding.length).toBeGreaterThan(0);
    });
  });

  describe('sorting scenarios', () => {
    it('should be sortable by price ascending', () => {
      const sorted = [...practitioners].sort((a, b) => a.pricePerSession - b.pricePerSession);
      for (let i = 1; i < sorted.length; i++) {
        expect((sorted[i] as any).pricePerSession).toBeGreaterThanOrEqual((sorted[i-1] as any).pricePerSession);
      }
    });

    it('should be sortable by rating descending', () => {
      const sorted = [...practitioners].sort((a, b) => b.rating - a.rating);
      for (let i = 1; i < sorted.length; i++) {
        expect((sorted[i] as any).rating).toBeLessThanOrEqual((sorted[i-1] as any).rating);
      }
    });

    it('should be sortable by review count descending', () => {
      const sorted = [...practitioners].sort((a, b) => b.reviewCount - a.reviewCount);
      for (let i = 1; i < sorted.length; i++) {
        expect((sorted[i] as any).reviewCount).toBeLessThanOrEqual((sorted[i-1] as any).reviewCount);
      }
    });
  });
});
