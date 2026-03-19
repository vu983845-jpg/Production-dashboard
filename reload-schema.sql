-- Giải phóng / Làm mới bộ đệm dữ liệu (Schema Cache) của Supabase
-- Để hệ thống nhận diện các cột mới nhất như manpower, shift_name
NOTIFY pgrst, 'reload schema';
