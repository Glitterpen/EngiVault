-- Let users remove only notifications addressed to their own account.
drop policy if exists notifications_self_delete on public.notifications;
create policy notifications_self_delete
on public.notifications
for delete
to authenticated
using (recipient_user_id = auth.uid());

grant delete on public.notifications to authenticated;
revoke delete on public.notifications from anon;
