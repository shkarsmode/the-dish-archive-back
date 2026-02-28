-- Changelog entry for 2026-02-28 — summary of today's work
BEGIN;

INSERT INTO changelog (version, title, description, action, "dishId", "dishTitle", changes, date) VALUES
('1.1.0', 'Міграція на PostgreSQL, адмінка та changelog', 'Сьогодні виконано велику роботу по міграції, додано changelog, авторизацію та адмін-панель, а також seed-скрипти.', 'improved', NULL, NULL, '{"Міграція даних з JSON до PostgreSQL (TypeORM)","Створені сутності: Dish, DishImage, Ingredient, CookingStep, ChangelogEntry","Переписаний DishesService на TypeORM репозиторії","Додано /api/changelog та сторінку /changelog на фронтенді","Реалізовано авторизацію адміністратора та адмін-панель","Виправлено поведінку закриття фільтрів на десктопі","Додано SQL seed для 30 страв та окремі seed для Brownie і Курки","Налаштовано DatabaseModule з підтримкою Neon/Supabase SSL"}', '2026-02-28T12:00:00.000Z');

COMMIT;
