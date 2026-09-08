import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
vi.mock('@/app/app/governance-actions',()=>({enterAdminRolePreview:vi.fn()}));
vi.mock('@/app/app/actions',()=>({}));
import {RolePreview} from './project-governance-controls';
afterEach(cleanup);
describe('named member preview selection',()=>{
 it('offers actual names, emails and all disciplines, rather than generic role cards',()=>{
  render(<RolePreview project={{id:'project',organisationId:'org'}} members={[
   {user_id:'eng',display_name:'Alex',email:'alex@example.test',role:'engineer',disciplines:['Electrical','Instrumentation']},
   {user_id:'pm',display_name:'Pat',email:'pat@example.test',role:'project_admin',disciplines:[]},
  ]}/>);
  expect(screen.getByRole('option',{name:/Alex.*Electrical \/ Instrumentation Engineer/})).toBeTruthy();
  expect(screen.getByRole('option',{name:/Pat.*Project Manager/})).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('Name, work email or discipline'),{target:{value:'instrumentation'}});
  expect(screen.queryByRole('option',{name:/Pat/})).toBeNull();
  expect(screen.getByLabelText('Support reason (recorded in the audit log)')).toBeTruthy();
 });
 it('explains when no accepted members exist',()=>{
  render(<RolePreview project={{id:'project',organisationId:'org'}} members={[]}/>);
  expect(screen.getByText(/No active Project Manager/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Open live/})).toBeNull();
 });
});
