const fs = require('fs');

const file = fs.readFileSync('src/app/(protected)/input/page.tsx', 'utf8');

const lines = file.split('\n');

const startIndex = lines.findIndex(l => l.includes('<TabsContent value="kpi" className="space-y-4">'));
const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('</TabsContent>'));

const formStart = `                                <TabsContent value="kpi" className="space-y-4">
                                    <div className="rounded-xl border bg-card text-card-foreground shadow">
                                        <div className="p-6">
                                            <Form {...formKpi}>
                                                <form onSubmit={formKpi.handleSubmit(onSubmitKpi)} className="space-y-6 max-w-2xl">
                                                    <div className="rounded-md border overflow-hidden">
                                                        <Table>
                                                            <TableHeader className="bg-muted/50">
                                                                <TableRow>
                                                                    <TableHead className="w-1/2">Chỉ tiêu KPI</TableHead>
                                                                    <TableHead className="w-1/2">Giá trị nhập</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {(() => {
                                                                    const selectedDeptCode = departments.find(d => d.id === selectedDept)?.code;
                                                                    const Row = ({ label, name, step, className = "" }: { label: string, name: any, step: string, className?: string }) => (
                                                                        <TableRow>
                                                                            <TableCell className={"font-medium align-middle " + className}>{label}</TableCell>
                                                                            <TableCell className="p-2 align-middle">
                                                                                <FormField control={formKpi.control} name={name} render={({ field }) => (
                                                                                    <FormItem><FormControl><Input type="number" step={step} {...field} className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                                )} />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );

                                                                    if (role === 'admin') {
                                                                        return (
                                                                            <>
                                                                                <Row label="WIP Tồn đầu ngày (T)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="WIP Tồn cuối ngày (T)" name="wip_close_ton" step="0.001" />
                                                                                <Row label="Input đầu vào (Tấn)" name="input_ton" step="0.001" />
                                                                                <Row label="Good Output đạt (Tính Yield)" name="good_output_ton" step="0.001" />
                                                                                <Row label="Downtime (Phút)" name="downtime_min" step="1" />
                                                                                <Row label="Tỷ lệ Bể (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ Sót lụa (Unpeel %)" name="unpeel_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ thu hồi (ISP %)" name="isp_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ SW (%)" name="sw_pct" step="0.1" />
                                                                                <Row label="Chỉ số điện (kWh)" name="electricity_meter_reading" step="1" className="text-amber-600 font-semibold" />
                                                                                {selectedDeptCode === "SHELL" && (
                                                                                    <TableRow>
                                                                                        <TableCell colSpan={2} className="p-0 border-b-0">
                                                                                            <div className="p-4 bg-amber-50">
                                                                                                {(() => {
                                                                                                    const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                                                    const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                                                    const actualTon = formActual.watch("actual_ton") || 0;
                                                                                                    const intensity = actualTon > 0 ? (consumption / actualTon).toFixed(2) : "0.00";

                                                                                                    if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">Chưa có chỉ số ngày hôm trước để tính tiêu thụ.</p>;

                                                                                                    return (
                                                                                                        <div className="grid grid-cols-2 gap-4">
                                                                                                            <div>
                                                                                                                <p className="text-xs text-amber-700 font-medium">Tiêu thụ Shelling hôm nay</p>
                                                                                                                <p className="text-xl font-bold text-amber-900">{consumption.toLocaleString()} <span className="text-sm font-normal">kWh</span></p>
                                                                                                                <p className="text-[10px] text-amber-600">(Số mới {currentMeter} - Số cũ {prevMeterReading})</p>
                                                                                                            </div>
                                                                                                            <div>
                                                                                                                <p className="text-xs text-amber-700 font-medium">Chỉ số kWh / Tấn (Shelling)</p>
                                                                                                                <p className="text-xl font-bold text-amber-900">{intensity} <span className="text-sm font-normal">kWh/T</span></p>
                                                                                                                <p className="text-[10px] text-amber-600">(Tiêu thụ / {actualTon} Tấn phẩm)</p>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    );
                                                                                                })()}
                                                                                            </div>
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "PEEL_MC") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tỷ lệ Bể (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Tỷ lệ Sót lụa (Unpeel %)" name="unpeel_pct" step="0.1" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "HAND") {
                                                                        return (
                                                                            <>
                                                                                <Row label="WIP Tồn đầu ngày (Tấn)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="WIP Tồn cuối ngày (Tấn)" name="wip_close_ton" step="0.001" />
                                                                                <Row label="Tỷ lệ thu hồi (ISP %)" name="isp_pct" step="0.1" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "SHELL") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tỷ lệ Bể (Broken %)" name="broken_pct" step="0.1" />
                                                                                <Row label="Chỉ số đồng hồ điện (kWh)" name="electricity_meter_reading" step="1" className="text-amber-600 font-semibold" />
                                                                                <TableRow>
                                                                                    <TableCell colSpan={2} className="p-0 border-b-0">
                                                                                        <div className="p-4 bg-amber-50 rounded-b-md">
                                                                                            {(() => {
                                                                                                const currentMeter = formKpi.watch("electricity_meter_reading") || 0;
                                                                                                const consumption = prevMeterReading !== null ? currentMeter - prevMeterReading : 0;
                                                                                                const targetActualTon = prevDayActual || 0;
                                                                                                const intensity = targetActualTon > 0 ? (consumption / targetActualTon).toFixed(2) : "0.00";

                                                                                                if (prevMeterReading === null) return <p className="text-xs text-muted-foreground italic">Chưa có chỉ số ngày hôm trước để tính tiêu thụ.</p>;

                                                                                                return (
                                                                                                    <div className="grid grid-cols-2 gap-4">
                                                                                                        <div>
                                                                                                            <p className="text-xs text-amber-700 font-medium">Tiêu thụ Ca trước (Tự động tính)</p>
                                                                                                            <p className="text-xl font-bold text-amber-900">{consumption.toLocaleString()} <span className="text-sm font-normal">kWh</span></p>
                                                                                                            <p className="text-[10px] text-amber-600">(Mới {currentMeter} - Cũ {prevMeterReading})</p>
                                                                                                        </div>
                                                                                                        <div>
                                                                                                            <p className="text-xs text-amber-700 font-medium">Chỉ số kWh / Tấn (Ca trước)</p>
                                                                                                            <p className="text-xl font-bold text-amber-900">{intensity} <span className="text-sm font-normal">kWh/T</span></p>
                                                                                                            {targetActualTon > 0
                                                                                                                ? <p className="text-[10px] text-amber-600">(Tiêu thụ / {targetActualTon} Tấn phẩm ngày trước)</p>
                                                                                                                : <p className="text-[10px] text-red-500 italic">Chưa có sản lượng ngày hôm trước</p>
                                                                                                            }
                                                                                                        </div>
                                                                                                    </div>
                                                                                                );
                                                                                            })()}
                                                                                        </div>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            </>
                                                                        );
                                                                    }

                                                                    if (selectedDeptCode === "BORMA") {
                                                                        return <Row label="Tỷ lệ SW (%)" name="sw_pct" step="0.1" />;
                                                                    }

                                                                    if (selectedDeptCode === "STEAM") {
                                                                        return (
                                                                            <>
                                                                                <Row label="Tồn kho đầu ngày (Tấn)" name="wip_open_ton" step="0.001" />
                                                                                <Row label="Tồn kho cuối ngày (Tấn)" name="wip_close_ton" step="0.001" />
                                                                            </>
                                                                        );
                                                                    }

                                                                    // Default
                                                                    return (
                                                                        <>
                                                                            <Row label="WIP Tồn đầu ngày (T)" name="wip_open_ton" step="0.001" />
                                                                            <Row label="WIP Tồn cuối ngày (T)" name="wip_close_ton" step="0.001" />
                                                                            <Row label="Input đầu vào (Tấn)" name="input_ton" step="0.001" />
                                                                            <Row label="Good Output đạt (Tính Yield)" name="good_output_ton" step="0.001" />
                                                                        </>
                                                                    );
                                                                })()}
                                                                
                                                                <TableRow>
                                                                    <TableCell className="font-medium align-middle border-b-0">Ghi chú (Tùy chọn)</TableCell>
                                                                    <TableCell className="p-2 align-middle border-b-0">
                                                                        <FormField control={formKpi.control} name="note" render={({ field }) => (
                                                                            <FormItem><FormControl><Input {...field} placeholder="Vd: ... " className="bg-transparent border-0 ring-offset-0 focus-visible:ring-1 shadow-none" /></FormControl></FormItem>
                                                                        )} />
                                                                    </TableCell>
                                                                </TableRow>
                                                            </TableBody>
                                                        </Table>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-t pt-4 gap-4">
                                                        <p className="text-sm font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded-md border border-amber-200 flex-1">
                                                            ⚠️ <span className="font-bold">Lưu ý:</span> Bạn nhớ bấm nút <strong>Lưu KPI</strong> sau khi nhập xong nhé!
                                                        </p>
                                                        <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                                                            <Save className="mr-2 h-4 w-4" />
                                                            {isSaving ? "Đang lưu..." : "Lưu KPI"}
                                                        </Button>
                                                    </div>
                                                </form>
                                            </Form>
                                        </div>
                                    </div>
                                </TabsContent>`;

const newFile = [...lines.slice(0, startIndex), formStart, ...lines.slice(endIndex + 1)].join('\n');
fs.writeFileSync('src/app/(protected)/input/page.tsx', newFile);
console.log('Done rewriting KPI form.');
