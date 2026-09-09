import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {AdminPreviewBoundary} from './admin-preview-boundary';
import {HelpTip} from './help-tip';
const refresh=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers()});
const preview={organisationId:'org',projectId:'project',role:'engineer' as const,displayName:'Alex Example',disciplines:['Electrical','Instrumentation'],expiresAt:'2026-09-09T00:00:00Z'};
describe('live read-only member banner',()=>{
 it('allows help without unlocking editing or form submission',()=>{
  const mutate=vi.fn();
  render(<AdminPreviewBoundary preview={preview}><form method="post" onSubmit={mutate}><input aria-label="Edit document"/><button>Save document</button><HelpTip label="Document guidance">Optional instructions.</HelpTip></form></AdminPreviewBoundary>);
  const help=screen.getByRole('button',{name:'Document guidance'}) as HTMLButtonElement;
  expect(help.disabled).toBe(false);
  expect((screen.getByRole('button',{name:'Save document'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(help);expect(screen.getByRole('tooltip')).toBeTruthy();
  fireEvent.submit(help.closest('form')!);expect(mutate).not.toHaveBeenCalled();
 });
 it('identifies the actual member and allows links and GET filters, not changes',()=>{
  const mutate=vi.fn();
  render(<AdminPreviewBoundary preview={preview}><a href="/document">Open document</a><form method="post" onSubmit={mutate}><input aria-label="Change title"/><button>Save</button></form><form method="get"><input aria-label="Filter"/><button>Apply</button></form><form onSubmit={mutate}><input aria-label="New question"/><button>Ask</button></form></AdminPreviewBoundary>);
  expect(screen.getByText(/Alex Example.*Electrical \/ Instrumentation Engineer/)).toBeTruthy();
  expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Ask'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Apply'}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole('link',{name:'Open document'}).closest('.pointer-events-none')).toBeNull();
  fireEvent.submit(screen.getByRole('button',{name:'Save'}).closest('form')!);expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Refresh live data'}));expect(refresh).toHaveBeenCalled();
 });
 it('does not lock ordinary workspaces',()=>{
  render(<AdminPreviewBoundary preview={null}><button>Save</button></AdminPreviewBoundary>);
  expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText(/Live read-only preview/)).toBeNull();
 });
});
