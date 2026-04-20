-- Tạo bảng lưu V-NET session token
-- Chạy file này 1 lần trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.vnet_sessions (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  sid        TEXT NOT NULL,
  cuid       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chỉ cho phép service_role đọc/ghi (không expose ra ngoài)
ALTER TABLE public.vnet_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only" ON public.vnet_sessions
  USING (auth.role() = 'service_role');

-- Tạo row mặc định (SID cũ tạm thời để test)
INSERT INTO public.vnet_sessions (id, sid, cuid, updated_at)
VALUES (1, 'b587a89300124115a777d6137e095372', '1026098', now())
ON CONFLICT (id) DO NOTHING;

-- Kiểm tra
SELECT * FROM public.vnet_sessions;
