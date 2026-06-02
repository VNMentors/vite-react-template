-- Thêm sản phẩm Pre180 và Pre365 (có trong CSV nhưng chưa có trong DB)
INSERT INTO products (name, price, description)
SELECT 'Pre180', 0, 'Khóa học 180 ngày'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE LOWER(name) = 'pre180');

INSERT INTO products (name, price, description)
SELECT 'Pre365', 0, 'Khóa học 365 ngày'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE LOWER(name) = 'pre365');
