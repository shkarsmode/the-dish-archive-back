-- Seed: Шоколадний Брауні (dish-031)
-- Adds dish, image, ingredients, cooking steps and a changelog entry

BEGIN;

INSERT INTO dishes (id, title, slug, description, rating, "priceAmount", "priceCurrency", "preparationTime", "cookingTimeMins", "totalTime", calories, servings, difficulty, tags, categories, "tasteSweet", "tasteSalty", "tasteSour", "tasteBitter", "tasteSpicy", "tasteUmami", notes, "sourceUrl", "createdAt", "updatedAt") VALUES
('dish-031', 'Шоколадний Брауні 🍫', 'shokoladnyi-brauni', 'Щільний шоколадний брауні з вологою серединкою — ідеальний десерт для поділу або з шаріком ванільного морозива.', 5, 0, 'UAH', 15, 25, 40, 420, 9, 'easy', '{"брауні","шоколад","десерт","випічка"}', '{"dessert","baking"}', 5, 0, 0, 2, 0, 0, 'Не пересушуйте — середина повинна лишатися трохи вологою. Охолоджуйте повністю перед нарізанням.', 'https://www.instagram.com/reels/DT7r6aiDBei/', '2026-02-28T11:20:00.000Z', '2026-02-28T11:20:00.000Z');

INSERT INTO dish_images (url, alt, "isPrimary", "dishId") VALUES
('/images/brownie.jpg', 'Шоколадний брауні у формі, нарізані квадрати', true, 'dish-031');

-- Ingredients
INSERT INTO ingredients (name, amount, unit, optional, "sortOrder", "dishId") VALUES
('Темний шоколад 50–55%', '200', 'г', false, 0, 'dish-031'),
('Вершкове масло', '150', 'г', false, 1, 'dish-031'),
('Яйця', '3 (≈160)', 'шт', false, 2, 'dish-031'),
('Цукор', '180', 'г', false, 3, 'dish-031'),
('Борошно', '70', 'г', false, 4, 'dish-031'),
('Какао порошок', '30', 'г', false, 5, 'dish-031');

-- Cooking steps
INSERT INTO cooking_steps ("stepOrder", description, duration, "dishId") VALUES
(1, 'Шоколад разом із вершковим маслом розтопити на водяній бані або короткими імпульсами в мікрохвильовці. Перемішати до гладкої блискучої маси, дати трохи охолонути.', 5, 'dish-031'),
(2, 'Яйця збити з цукром до легкої світлої маси (~2–3 хвилини). Нам не потрібна дуже пишна піна.', 3, 'dish-031'),
(3, 'Влити теплу (не гарячу) шоколадну масу до яєчної суміші і обережно перемішати лопаткою.', 2, 'dish-031'),
(4, 'Додати просіяне борошно та какао. Перемішати до однорідності, але не перемішувати занадто довго.', 2, 'dish-031'),
(5, 'Перелити тісто у форму 18×18 см, вистелену пергаментом, і розрівняти.', 2, 'dish-031'),
(6, 'Випікати в розігрітій до 170°C духовці приблизно 23–25 хвилин — середина повинна залишатися трохи вологою.', 24, 'dish-031'),
(7, 'Дати повністю охолонути у формі, потім нарізати на квадрати. Подавати охолодженими або з морозивом.', 60, 'dish-031');

-- Changelog entry
INSERT INTO changelog (version, title, description, action, "dishId", "dishTitle", changes, date) VALUES
('1.0.1', 'Додано: Шоколадний Брауні', 'Додано новий рецепт "Шоколадний Брауні" з інгредієнтами та покроковою інструкцією.', 'added', 'dish-031', 'Шоколадний Брауні 🍫', '{"Додано рецепт Шоколадний Брауні","Інгредієнти та покрокова інструкція","Додано рекомендації по випіканню (170°C, 23–25 хв)"}', '2026-02-28T11:20:00.000Z');

COMMIT;
