# Quizroom

## Development

- Hosted via Supabase functions + client side `@supabase/supabase-js`
- Static site, served via Vite/ESM compatible browsers

### Database migration (time-based scoring)

Run the following SQL to extend `quiz_answers` without breaking existing data:

```sql
alter table public.quiz_answers
  add column if not exists answer_ms integer,
  add column if not exists points integer;

create index if not exists quiz_answers_question_idx on public.quiz_answers(question_id);
create index if not exists quiz_answers_participant_idx on public.quiz_answers(participant_id);
```
