import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AttendeeInput from '../AttendeeInput';
import AppTheme from '@/theme/AppTheme';

// Mock ApiContext
const mockSearchPeople = vi.fn();
vi.mock('@/context/ApiContext', () => ({
  useApi: () => ({
    searchPeople: mockSearchPeople,
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderAttendeeInput(props: React.ComponentProps<typeof AttendeeInput>) {
  return render(
    <AppTheme>
      <AttendeeInput {...props} />
    </AppTheme>,
  );
}

describe('AttendeeInput component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders custom email chips with proper text labels and not blank', () => {
    const handleChange = vi.fn();
    const existingAttendees = [
      { name: 'john.doe', email: 'john.doe@example.com', photo: '' },
    ];

    renderAttendeeInput({
      id: 'attendees',
      value: existingAttendees,
      onChange: handleChange,
    });

    // The chip label should show 'john.doe', not empty
    expect(screen.getByText('john.doe')).toBeDefined();
  });

  it('renders chips correctly when custom typed email is added', () => {
    const handleChange = vi.fn();
    const { rerender } = renderAttendeeInput({
      id: 'attendees',
      value: [],
      onChange: handleChange,
    });

    const input = screen.getByPlaceholderText('Attendees');

    // Type a custom email and press Enter
    fireEvent.change(input, { target: { value: 'custom.user@domain.com' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // onChange should be called with validPeople containing the custom email
    expect(handleChange).toHaveBeenCalledWith('attendees', [
      { name: 'custom.user', email: 'custom.user@domain.com', photo: '' },
    ]);

    // Rerender with the new value as parent component would
    rerender(
      <AppTheme>
        <AttendeeInput
          id="attendees"
          value={[{ name: 'custom.user', email: 'custom.user@domain.com', photo: '' }]}
          onChange={handleChange}
        />
      </AppTheme>,
    );

    expect(screen.getByText('custom.user')).toBeDefined();
  });

  it('debounces attendee search input and does not fire on every keystroke', async () => {
    vi.useFakeTimers();

    mockSearchPeople.mockResolvedValue({
      status: 'success',
      data: [{ name: 'Alice Smith', email: 'alice@example.com', photo: '' }],
    });

    const handleChange = vi.fn();
    renderAttendeeInput({
      id: 'attendees',
      value: [],
      onChange: handleChange,
    });

    const input = screen.getByPlaceholderText('Attendees');

    // Keystroke 1: "a"
    fireEvent.change(input, { target: { value: 'a' } });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(mockSearchPeople).not.toHaveBeenCalled();

    // Keystroke 2: "ali" (> 2 characters)
    fireEvent.change(input, { target: { value: 'ali' } });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    // Should NOT have fired yet because 300ms has not passed since last keystroke
    expect(mockSearchPeople).not.toHaveBeenCalled();

    // Keystroke 3: "alice"
    fireEvent.change(input, { target: { value: 'alice' } });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockSearchPeople).not.toHaveBeenCalled();

    // Advance past the 300ms threshold from the last keystroke
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockSearchPeople).toHaveBeenCalledTimes(1);
    expect(mockSearchPeople).toHaveBeenCalledWith('alice');
  });

  it('stabilizes debounce across parent/component render cycles', async () => {
    vi.useFakeTimers();

    mockSearchPeople.mockResolvedValue({
      status: 'success',
      data: [],
    });

    const handleChange = vi.fn();
    const { rerender } = renderAttendeeInput({
      id: 'attendees',
      value: [],
      onChange: handleChange,
    });

    const input = screen.getByPlaceholderText('Attendees');

    // Type a query > 2 chars
    fireEvent.change(input, { target: { value: 'testing' } });

    // Trigger re-render of component (simulating parent state updates)
    rerender(
      <AppTheme>
        <AttendeeInput
          id="attendees"
          value={[]}
          onChange={handleChange}
        />
      </AppTheme>,
    );

    // Advance timers by 200ms (still within 300ms)
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(mockSearchPeople).not.toHaveBeenCalled();

    // Advance the remaining 150ms
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(mockSearchPeople).toHaveBeenCalledTimes(1);
    expect(mockSearchPeople).toHaveBeenCalledWith('testing');
  });

  it('correctly identifies and applies active styling to selected attendees in dropdown options', async () => {
    const selectedPerson = { name: 'Bob Dylan', email: 'bob@example.com', photo: '' };
    const unselectedPerson = { name: 'Charlie Day', email: 'charlie@example.com', photo: '' };

    mockSearchPeople.mockResolvedValue({
      status: 'success',
      data: [selectedPerson, unselectedPerson],
    });

    const handleChange = vi.fn();
    renderAttendeeInput({
      id: 'attendees',
      value: [selectedPerson],
      onChange: handleChange,
    });

    const input = screen.getByPlaceholderText('Attendees');

    // Type query matching both emails
    fireEvent.change(input, { target: { value: 'example' } });

    // Wait for the 300ms debounce to fire searchPeople
    await waitFor(
      () => {
        expect(mockSearchPeople).toHaveBeenCalledWith('example');
      },
      { timeout: 1000 },
    );

    // Open dropdown
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => {
      expect(screen.getByText('Charlie Day')).toBeDefined();
    });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);

    const bobOption = options.find((opt) => opt.textContent?.includes('bob@example.com'));
    const charlieOption = options.find((opt) => opt.textContent?.includes('charlie@example.com'));

    expect(bobOption).toBeDefined();
    expect(charlieOption).toBeDefined();

    // Bob is selected while Charlie is not; verify they have distinct style classes applied
    expect(bobOption?.className).not.toBe(charlieOption?.className);
  });
});
