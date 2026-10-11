-- Tiny development seed (the 500+ row dataset comes later). Run after schema.sql.
SET search_path = karthub;
INSERT INTO category(name,parent_id) VALUES ('Electronics',NULL),('Mobiles',1),('Laptops',1),('Books',NULL);
INSERT INTO product(category_id,name,brand,description) VALUES
 (2,'Galaxy M14 5G','Samsung','6GB RAM smartphone'),
 (2,'Redmi Note 13','Xiaomi','8GB RAM smartphone'),
 (3,'ThinkPad E14','Lenovo','14 inch business laptop'),
 (4,'Database System Concepts','McGraw Hill','Silberschatz, 7th ed');
-- seller accounts (password for all dev users: secret1; hash generated below by the app on register, so use API to create users)
