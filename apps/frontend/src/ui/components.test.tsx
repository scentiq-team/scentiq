import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ApiError } from '@/services/api/errors';
import { Button, ButtonLink } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Input } from './Input';
import { Logo } from './Logo';
import { LogoMark } from './LogoMark';
import { Skeleton } from './Skeleton';

function inLocale(locale: 'ar' | 'en', ui: React.ReactNode) {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe('Button', () => {
  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('is disabled and marked busy while loading, and ignores clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is not marked busy when idle', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('keeps a comfortable touch target', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-11');
  });

  it('renders a router link that looks like a button', () => {
    const router = createMemoryRouter([
      { path: '/', element: <ButtonLink to="/x">Go</ButtonLink> },
    ]);
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/x');
  });
});

describe('Input', () => {
  it('ties the visible label to the field', () => {
    render(<Input label="Phone" />);
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
  });

  it('marks the field invalid and links the error and the hint to it', () => {
    render(<Input label="Phone" hint="Iraqi mobile number" error="Enter a valid number" />);
    const field = screen.getByLabelText('Phone');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (field.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Iraqi mobile number', 'Enter a valid number']);
  });

  it('has no invalid state or description when everything is fine', () => {
    render(<Input label="Phone" />);
    const field = screen.getByLabelText('Phone');
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(field).not.toHaveAttribute('aria-describedby');
  });

  it('uses a different id for each field', () => {
    render(
      <>
        <Input label="One" />
        <Input label="Two" />
      </>,
    );
    expect(screen.getByLabelText('One').id).not.toBe(screen.getByLabelText('Two').id);
  });
});

describe('EmptyState', () => {
  it('shows a title, an explanation and the next step', () => {
    render(
      <EmptyState
        title="Nothing yet"
        description="Add your first item."
        action={<button type="button">Add</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing yet' })).toBeInTheDocument();
    expect(screen.getByText('Add your first item.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('uses the heading level the page outline needs', () => {
    render(<EmptyState headingLevel={1} title="Page" description="Text" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page' })).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('announces the problem in Arabic using the error code', () => {
    inLocale('ar', <ErrorState error={new ApiError('rate_limited', { status: 429 })} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('حدث خطأ');
    expect(alert).toHaveTextContent('محاولات كثيرة خلال وقت قصير');
  });

  it('announces the problem in English', () => {
    inLocale('en', <ErrorState error={new ApiError('network_error')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('We could not connect');
  });

  it('never shows the raw error message, only the translated text', () => {
    inLocale('en', <ErrorState error={new Error('SELECT * FROM users failed at 10.0.0.5')} />);
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveTextContent('SELECT');
    expect(alert).toHaveTextContent('Something went wrong on our side');
  });

  it('shows the reference number only when the server gave one', () => {
    const { unmount } = inLocale(
      'en',
      <ErrorState error={new ApiError('internal_error', { requestId: 'abc-123' })} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: abc-123');
    unmount();
    inLocale('en', <ErrorState error={new ApiError('internal_error')} />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('Reference');
  });

  it('offers a retry only when there is something to retry', async () => {
    const onRetry = vi.fn();
    const { unmount } = inLocale(
      'en',
      <ErrorState error={new ApiError('internal_error')} onRetry={onRetry} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    unmount();
    inLocale('en', <ErrorState error={new ApiError('internal_error')} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Logo', () => {
  it('always reads as the Latin brand name, even inside an Arabic page', () => {
    render(<Logo />);
    expect(screen.getByText('Scent').closest('[dir]')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('IQ')).toBeInTheDocument();
  });
});

describe('LogoMark', () => {
  it('is decorative by default (hidden from assistive technology)', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('is announced as an image when it has a title', () => {
    render(<LogoMark title="ScentIQ" />);
    expect(screen.getByRole('img', { name: 'ScentIQ' })).toBeInTheDocument();
  });

  it('draws the S and the IQ from real outlines, with no inline styles (CSP)', () => {
    const { container } = render(<LogoMark />);
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    for (const path of paths) expect(path.getAttribute('d')?.length).toBeGreaterThan(100);
    expect(container.querySelector('[style]')).toBeNull();
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology (the page announces loading itself)', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
