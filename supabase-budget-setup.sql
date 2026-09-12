-- Create the monthly budgets table for this app.
-- One row per user per month/year.

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, year)
);

-- Optional: keep the updated_at timestamp fresh when a row changes.
create or replace function public.update_budget_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_budgets_updated_at on public.budgets;
create trigger update_budgets_updated_at
before update on public.budgets
for each row
execute function public.update_budget_updated_at();

-- Enable row level security.
alter table public.budgets enable row level security;

-- Users can only access their own budget rows.
create policy "Users can view their own budgets"
on public.budgets for select
using (auth.uid() = user_id);

create policy "Users can create their own budgets"
on public.budgets for insert
with check (auth.uid() = user_id);

create policy "Users can update their own budgets"
on public.budgets for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own budgets"
on public.budgets for delete
using (auth.uid() = user_id);
