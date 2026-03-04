"use client"

import { useState } from "react"
import { ShieldAlert, Plus, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"

export default function AdminUsersPage() {
    const [users] = useState([
        // Mock data for UI preview
        { id: "1", email: "admin@factory.com", role: "admin", dept: "Tất cả", name: "Nguyễn Văn Admin" },
        { id: "2", email: "rcn@factory.com", role: "dept_user", dept: "Kho RCN", name: "Trần Nhập Liệu" },
    ])

    const [isOpen, setIsOpen] = useState(false)

    const handleCreateUser = (e: React.FormEvent) => {
        e.preventDefault()
        toast.success("Giả lập tạo user thành công. Vui lòng sử dụng tính năng Admin của Supabase.")
        setIsOpen(false)
    }

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between space-y-2 border-b pb-4 mb-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Quản Lý Người Dùng</h2>
                    <p className="text-muted-foreground flex items-center gap-2 mt-1">
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                        Chỉ Admin (Quản trị viên) mới có quyền truy cập
                    </p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Tạo mới User
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <form onSubmit={handleCreateUser}>
                            <DialogHeader>
                                <DialogTitle>Tạo người dùng mới</DialogTitle>
                                <DialogDescription>
                                    Hệ thống sử dụng Supabase Auth. Bạn cần tạo user và gán quyền tương ứng.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="name" className="text-right">Họ tên</Label>
                                    <Input id="name" className="col-span-3" required />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="email" className="text-right">Email</Label>
                                    <Input id="email" type="email" className="col-span-3" required />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="password" className="text-right">Mật khẩu</Label>
                                    <Input id="password" type="password" className="col-span-3" required />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label className="text-right">Role (Quyền)</Label>
                                    <Select defaultValue="dept_user">
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Chọn quyền" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="dept_user">Nhập liệu (dept_user)</SelectItem>
                                            <SelectItem value="viewer">Chỉ xem (viewer)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit">Lưu User</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="bg-card border rounded-xl shadow overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Họ và Tên</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Chức vụ (Role)</TableHead>
                            <TableHead>Bộ phận ID</TableHead>
                            <TableHead className="text-right">Thao tác</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((u) => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">{u.name}</TableCell>
                                <TableCell>{u.email}</TableCell>
                                <TableCell>
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {u.role.toUpperCase()}
                                    </span>
                                </TableCell>
                                <TableCell>{u.dept}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" className="text-primary">
                                        <Save className="h-4 w-4 mr-1" />
                                        Đổi Pass
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="mt-8 p-4 bg-muted/50 rounded-lg border text-sm">
                <p className="font-bold flex items-center mb-2"><ShieldAlert className="w-4 h-4 mr-2" /> Hướng dẫn thực tế Supabase API:</p>
                <p>Việc tạo user mới từ phía client trực tiếp có thể gặp giới hạn về bảo mật (Supabase không cho phép user thường tự tạo user khác có role cao hơn mà không qua Edge API / Admin API). Do đó, cách an toàn nhất trong Production là dùng <code className="bg-muted px-1">@supabase/supabase-js</code> Admin client ở Server Action, hoặc thao tác trực tiếp trên giao diện Supabase Dashboard.</p>
            </div>
        </div>
    )
}
