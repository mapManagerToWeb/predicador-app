import { Profile } from './profile';

describe('Profile', () => {
  let service: Profile;

  beforeEach(() => {
    localStorage.clear();
    service = new Profile();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('hasProfile', () => {
    it('should return false when no profile exists', () => {
      expect(service.hasProfile()).toBeFalsy();
    });

    it('should return true when profile exists', () => {
      service.save({ name: 'Daniel', lastName: 'Uribe', avatar: 0 });
      expect(service.hasProfile()).toBeTruthy();
    });
  });

  describe('save', () => {
    it('should save profile to localStorage', () => {
      const profile = { name: 'Daniel', lastName: 'Uribe', avatar: 0 };
      service.save(profile);

      expect(service.currentUser()).toEqual(profile);

      const stored = JSON.parse(localStorage.getItem('territory_profile') || '{}');
      expect(stored).toEqual(profile);
    });

    it('should update existing profile', () => {
      service.save({ name: 'Daniel', lastName: 'Uribe', avatar: 0 });
      service.save({ name: 'Maria', lastName: 'Lopez', avatar: 1 });

      expect(service.currentUser()?.name).toBe('Maria');
    });
  });

  describe('clear', () => {
    it('should remove profile from localStorage', () => {
      service.save({ name: 'Daniel', lastName: 'Uribe', avatar: 0 });
      service.clear();

      expect(service.currentUser()).toBeNull();
      expect(localStorage.getItem('territory_profile')).toBeNull();
    });
  });

  describe('currentUser signal', () => {
    it('should load existing profile on init', () => {
      const profile = { name: 'Daniel', lastName: 'Uribe', avatar: 0 };
      localStorage.setItem('territory_profile', JSON.stringify(profile));

      const newService = new Profile();
      expect(newService.currentUser()).toEqual(profile);
    });

    it('should be null when localStorage is empty', () => {
      const newService = new Profile();
      expect(newService.currentUser()).toBeNull();
    });

    it('clears malformed JSON instead of throwing', () => {
      localStorage.setItem('territory_profile', '{not-json');

      const newService = new Profile();

      expect(newService.currentUser()).toBeNull();
      expect(localStorage.getItem('territory_profile')).toBeNull();
    });

    it.each([
      {},
      { name: 'Daniel', lastName: 'Uribe' },
      { name: 'Daniel', lastName: 'Uribe', avatar: '0' },
      { name: '', lastName: 'Uribe', avatar: 0 },
    ])('clears a profile with invalid required fields: %j', invalidProfile => {
      localStorage.setItem('territory_profile', JSON.stringify(invalidProfile));

      const newService = new Profile();

      expect(newService.currentUser()).toBeNull();
      expect(localStorage.getItem('territory_profile')).toBeNull();
    });

    it('does not access browser storage during SSR', () => {
      vi.stubGlobal('localStorage', undefined);

      expect(new Profile().currentUser()).toBeNull();

      vi.unstubAllGlobals();
    });
  });
});
