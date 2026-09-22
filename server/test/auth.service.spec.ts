import { AuthService } from '../src/auth/auth.service';

describe('Issue #22', () => {
  let service: AuthService;

  beforeEach(() => {
    service = Object.create(AuthService.prototype);
  });

  it('should sort floors naturally and ignore missing floors', async () => {
    jest.spyOn(service, 'getDirectoryResources').mockResolvedValue([
      { floor: 'F10' },
      { floor: 'F2' },
      { floor: 'F1' },
      { floor: undefined },
      { floor: 'F20' },
    ] as any);

    const result = await service.getFloors({} as any);

    expect(result).toEqual(['F1', 'F2', 'F10', 'F20']);
  });

  it('should handle missing calendar items safely', async () => {
    const googleApiService = {
      getCalendarResources: jest.fn().mockResolvedValue({}),
    };

    const testService = Object.create(AuthService.prototype);

    (testService as any).googleApiService = googleApiService;
    (testService as any).saveToCache = jest.fn();
    (testService as any).logger = {
      log: jest.fn(),
    };

    const result = await testService.createDirectoryResources({} as any);

    expect(result).toEqual([]);
  });

  it('should handle contacts without email addresses safely', async () => {
    const googleApiService = {
      listPeople: jest.fn().mockResolvedValue([
        {
          names: [
            {
              metadata: { primary: true },
              displayName: 'Test User',
            },
          ],
          photos: [],
        },
      ]),
    };

    const testService = Object.create(AuthService.prototype);

    (testService as any).googleApiService = googleApiService;
    (testService as any).saveToCache = jest.fn();
    (testService as any).logger = {
      log: jest.fn(),
    };

    const result = await testService.createPeopleList({} as any);

    expect(result).toEqual([
      {
        email: undefined,
        name: 'Test User',
        photo: undefined,
      },
    ]);
  });
});