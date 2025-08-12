import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Search, ChevronDown, ChevronUp, Settings, AlertTriangle, Loader, Dna, DnaOff, ClipboardPlus, ClipboardMinus, MonitorCheck, MonitorOff, RefreshCcw, Zap, ZapOff, FlaskConical, Monitor, ClipboardCheck } from 'lucide-react';

// --- Helper function to parse main CSV data ---
const parseSviCsv = (csvString) => {
    const rows = csvString.trim().split('\n');
    const header = rows[0].split(',').map(h => h.trim().replace(/"/g, '')).slice(1);
    const dataRows = rows.slice(1); 
    const data = dataRows.map(row => {
        const values = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
        const relevantValues = values.slice(1);
        const obj = {};
        header.forEach((key, i) => {
            let value = relevantValues[i] ? relevantValues[i].trim().replace(/"/g, '') : 'NA';
            obj[key] = (value === 'NA' || value === '') ? 'N/A' : value;
        });
        return obj;
    });
    return { header, data };
};

// --- Helper function to parse schedule CSV data ---
const parseScheduleCsv = (csvString) => {
    const rows = csvString.trim().split('\n');
    if (rows.length < 2) return [];

    const header = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const sampleIdIndex = header.indexOf('Sample ID');
    const meetingDateIndex = header.indexOf('meeting_date');
    
    if (sampleIdIndex === -1 || meetingDateIndex === -1) {
        console.error("Schedule CSV must contain 'Sample ID' and 'meeting_date' columns.");
        return [];
    }
    
    return rows.slice(1).map(row => {
        const values = row.split(',');
        return {
            sampleId: values[sampleIdIndex] ? values[sampleIdIndex].replace(/"/g, '') : '',
            meetingDate: values[meetingDateIndex]
        };
    }).filter(item => item.sampleId && item.meetingDate);
};


// --- Analysis Schedule Component ---
const AnalysisSchedule = ({ scheduleData }) => {
    const upcomingMeetings = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return scheduleData
            .map(item => ({
                ...item,
                date: new Date(item.meetingDate + "T00:00:00"),
            }))
            .filter(item => item.date >= today)
            .sort((a, b) => a.date - b.date);
    }, [scheduleData]);

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 className="font-franklin text-2xl font-bold text-gray-800 mb-4">Analysis Schedule</h2>
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '250px' }}>
                {upcomingMeetings.length > 0 ? (
                    upcomingMeetings.map(({ sampleId, date }, index) => (
                        <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                            <span className="font-semibold text-gray-700">{sampleId}</span>
                            <span className="text-sm font-medium text-blue-600">{`${date.toLocaleDateString()} (${daysOfWeek[date.getDay()]})`}</span>
                        </div>
                    ))
                ) : (
                    <p className="text-gray-500 text-center py-4">No upcoming meetings scheduled.</p>
                )}
            </div>
        </div>
    );
}

// --- Main Application Component ---
const App = () => {
    // --- State Management ---
    const [data, setData] = useState([]);
    const [scheduleData, setScheduleData] = useState([]);
    const [initialHeader, setInitialHeader] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'Date Received', direction: 'descending' });
    
    // --- Filter States ---
    const [identifierFilter, setIdentifierFilter] = useState('All');
    const [probandFilter, setProbandFilter] = useState('1');
    const [geneyxFilter, setGeneyxFilter] = useState('All');
    const [reportFilter, setReportFilter] = useState('All');
    const [processedFilter, setProcessedFilter] = useState('All');


    useEffect(() => {
        Promise.all([
            fetch('/svi_database.csv'),
            fetch('/analysis_scheduler.csv')
        ])
        .then(async ([sviResponse, scheduleResponse]) => {
            if (!sviResponse.ok) throw new Error(`Could not load main database: ${sviResponse.statusText}`);
            if (!scheduleResponse.ok) throw new Error(`Could not load schedule: ${scheduleResponse.statusText}`);

            const sviText = await sviResponse.text();
            const scheduleText = await scheduleResponse.text();

            return { sviText, scheduleText };
        })
        .then(({ sviText, scheduleText }) => {
            const { header, data: rawData } = parseSviCsv(sviText);
            const schedule = parseScheduleCsv(scheduleText);
            
            const preFilteredData = rawData.filter(row => {
                const isSampleIdNA = row['Sample ID'] === 'N/A';
                const isDateReceivedNA = row['Date Received'] === 'N/A';
                const isMrnNA = row['MRN'] === 'N/A';
                const isAgenIdNA = row['AGen ID'] === 'N/A';
                return !(isSampleIdNA && isDateReceivedNA && isMrnNA && isAgenIdNA);
            });

            setInitialHeader(header);
            setData(preFilteredData);
            setScheduleData(schedule);
        })
        .catch(e => {
            console.error("Error fetching or parsing data:", e);
            setError(e.message);
        })
        .finally(() => {
            setLoading(false);
        });
    }, []);

    const visibleColumns = useMemo(() => [
        'Sample ID', 
        'Date Received', 
        'MRN', 
        'Submitter ID/ Acc. No.', 
        'Comments', 
        'AGen ID', 
        'DataDate',
        'SamplePath'
    ], []);
    
    const header = useMemo(() => ['Status', ...visibleColumns], [visibleColumns]);

    const uniqueIdentifiers = useMemo(() => {
        if (data.length === 0) return [];
        const identifiers = [...new Set(data.map(item => item.Identifier).filter(id => id !== 'N/A'))];
        return identifiers.sort();
    }, [data]);

    const filteredData = useMemo(() => {
        let dataToProcess = [...data];

        if (identifierFilter !== 'All') {
            dataToProcess = dataToProcess.filter(item => item.Identifier === identifierFilter);
        }
        if (probandFilter !== 'All') {
            dataToProcess = dataToProcess.filter(item => item.proband === probandFilter);
        }
        if (geneyxFilter !== 'All') {
            dataToProcess = dataToProcess.filter(item => item.geneyx_uploaded === geneyxFilter);
        }
        if (reportFilter !== 'All') {
            dataToProcess = dataToProcess.filter(item => item.report === reportFilter);
        }
        if (processedFilter !== 'All') {
            const isProcessed = processedFilter === '1';
            dataToProcess = dataToProcess.filter(item => (item.DataDate !== 'N/A') === isProcessed);
        }
        
        if (sortConfig.key) {
            dataToProcess.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (sortConfig.key === 'Date Received') {
                    if (aVal === 'N/A') return 1; if (bVal === 'N/A') return -1;
                    const dateA = new Date(aVal); const dateB = new Date(bVal);
                    return sortConfig.direction === 'ascending' ? dateA - dateB : dateB - dateA;
                }
                if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }

        if (!searchTerm) {
            return dataToProcess;
        }
        return dataToProcess.filter(item =>
            Object.values(item).some(val =>
                String(val).toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [data, searchTerm, sortConfig, identifierFilter, probandFilter, geneyxFilter, reportFilter, processedFilter]);

    const summaryStats = useMemo(() => {
        if (data.length === 0) return { totalSamples: 0, probandCount: 0, reportedCount: 0, processedCount: 0 };
        const totalSamples = data.length;
        const probandCount = data.filter(d => d.proband === '1').length;
        const reportedCount = data.filter(d => d.report === '1').length;
        const processedCount = data.filter(d => d.DataDate !== 'N/A').length;
        
        return {
            totalSamples, probandCount, reportedCount, processedCount,
        };
    }, [data]);

    const chartData = useMemo(() => {
        if (data.length === 0) return [];
        
        const probandData = data.filter(row => row.proband === '1');

        const groupedData = probandData.reduce((acc, row) => {
            const identifier = row.Identifier || 'N/A';
            if (identifier === 'N/A') return acc;
            
            if (!acc[identifier]) {
                acc[identifier] = { total: 0, reported: 0, analyzed: 0 };
            }

            acc[identifier].total += 1;

            const isReported = row.report === '1';
            const isAnalyzed = row.geneyx_uploaded === '1';

            if (isReported) {
                acc[identifier].reported += 1;
                acc[identifier].analyzed += 1;
            } else if (isAnalyzed) {
                acc[identifier].analyzed += 1;
            }
            
            return acc;
        }, {});
        
        return Object.entries(groupedData).map(([name, counts]) => ({
            name,
            Reported: counts.reported,
            Analyzed: counts.analyzed - counts.reported,
            Pending: counts.total - counts.analyzed,
        }));
    }, [data]);

    const handleSort = (key) => {
        setSortConfig(currentConfig => ({
            key,
            direction: currentConfig.key === key && currentConfig.direction === 'ascending' ? 'descending' : 'ascending',
        }));
    };
    
    const handleResetFilters = () => {
        setIdentifierFilter('All');
        setProbandFilter('1');
        setGeneyxFilter('All');
        setReportFilter('All');
        setProcessedFilter('All');
        setSearchTerm('');
    };

    // --- Render ---
    if (loading) { return (<div className="flex flex-col justify-center items-center min-h-screen bg-gray-50 text-gray-700"><Loader className="animate-spin h-12 w-12 text-blue-600" /><p className="mt-4 text-lg font-semibold">Loading Lab Data...</p></div>) }
    if (error) { return (<div className="flex flex-col justify-center items-center min-h-screen bg-red-50 text-red-700"><AlertTriangle className="h-12 w-12 text-red-500" /><p className="mt-4 text-xl font-bold">Error Loading Data</p><p className="mt-2 text-sm max-w-md text-center">{error}</p></div>) }

    return (
        <div className="bg-gray-50 min-h-screen text-gray-800 font-sans">
            <header className="bg-white shadow-md">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div>
                        {/* **CHANGE**: Added font-franklin class */}
                        <h1 className="font-franklin text-3xl font-bold text-gray-900 tracking-tight">Structural Variance Initiative Sample Dashboard</h1>
                        <p className="font-franklin text-gray-600 mt-1">MCW / CW Division of Genomic Pediatrics</p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <img src="/mcw.png" alt="MCW Logo" className="h-14" />
                        <img src="/cw.png" alt="CW Logo" className="h-14" />
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        {/* **CHANGE**: Added font-franklin class */}
                        <h3 className="font-franklin text-lg font-semibold text-gray-700 flex items-center"><FlaskConical className="h-5 w-5 mr-2 text-blue-500"/>Total Samples</h3>
                        <p className="text-4xl font-bold text-blue-600 mt-2">{summaryStats.totalSamples}</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                         {/* **CHANGE**: Added font-franklin class */}
                         <h3 className="font-franklin text-lg font-semibold text-gray-700 flex items-center"><Dna className="h-5 w-5 mr-2 text-green-500"/>Probands</h3>
                        <p className="text-4xl font-bold text-green-600 mt-2">{summaryStats.probandCount}</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        {/* **CHANGE**: Added font-franklin class */}
                        <h3 className="font-franklin text-lg font-semibold text-gray-700 flex items-center"><Zap className="h-5 w-5 mr-2 text-yellow-500"/>Processed Samples</h3>
                        <p className="text-4xl font-bold text-yellow-600 mt-2">{summaryStats.processedCount}</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        {/* **CHANGE**: Added font-franklin class */}
                        <h3 className="font-franklin text-lg font-semibold text-gray-700 flex items-center"><ClipboardCheck className="h-5 w-5 mr-2 text-indigo-500"/>Reported Samples</h3>
                        <p className="text-4xl font-bold text-indigo-600 mt-2">{summaryStats.reportedCount}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col">
                        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 flex-wrap">
                             {/* **CHANGE**: Added font-franklin class */}
                             <h2 className="font-franklin text-2xl font-bold text-gray-800">Sample Database</h2>
                             <div className="relative w-full sm:w-auto">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input type="text" placeholder="Search..." className="w-full sm:w-56 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                             </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4 p-4 bg-gray-50 rounded-lg border">
                            <div>
                                <label htmlFor="identifierFilter" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                <select id="identifierFilter" value={identifierFilter} onChange={e => setIdentifierFilter(e.target.value)} className="w-full p-2 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                    <option value="All">All</option>
                                    {uniqueIdentifiers.map(id => <option key={id} value={id}>{id}</option>)}
                                </select>
                            </div>
                             <div>
                                <label htmlFor="probandFilter" className="block text-sm font-medium text-gray-700 mb-1">Proband</label>
                                <select id="probandFilter" value={probandFilter} onChange={e => setProbandFilter(e.target.value)} className="w-full p-2 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                    <option value="All">All</option><option value="1">Yes</option><option value="0">No</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="processedFilter" className="block text-sm font-medium text-gray-700 mb-1">Processed</label>
                                <select id="processedFilter" value={processedFilter} onChange={e => setProcessedFilter(e.target.value)} className="w-full p-2 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                    <option value="All">All</option><option value="1">Yes</option><option value="0">No</option>
                                </select>
                            </div>
                             <div>
                                <label htmlFor="geneyxFilter" className="block text-sm font-medium text-gray-700 mb-1">Analyzed</label>
                                <select id="geneyxFilter" value={geneyxFilter} onChange={e => setGeneyxFilter(e.target.value)} className="w-full p-2 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                    <option value="All">All</option><option value="1">Yes</option><option value="0">No</option>
                                </select>
                            </div>
                             <div>
                                <label htmlFor="reportFilter" className="block text-sm font-medium text-gray-700 mb-1">Report</label>
                                <select id="reportFilter" value={reportFilter} onChange={e => setReportFilter(e.target.value)} className="w-full p-2 text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500">
                                    <option value="All">All</option><option value="1">Yes</option><option value="0">No</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 invisible">Reset</label>
                                <button 
                                    onClick={handleResetFilters}
                                    className="w-full flex items-center justify-center p-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    title="Reset all filters"
                                >
                                    <RefreshCcw className="h-4 w-4 mr-2" />
                                    Reset
                                </button>
                            </div>
                        </div>

                        <div className="overflow-auto rounded-lg border border-gray-200" style={{ maxHeight: '650px' }}>
                            <table className="w-full text-left table-auto">
                                <thead className="bg-gray-100">
                                    <tr>
                                        {header.map(h => (
                                            <th key={h} className="p-3 text-sm font-semibold tracking-wide cursor-pointer sticky top-0 bg-gray-100 z-10" onClick={() => h !== 'Status' && handleSort(h)}>
                                                <div className="flex items-center gap-1">{h}{sortConfig.key === h && h !== 'Status' ? (sortConfig.direction === 'ascending' ? <ChevronUp size={16} /> : <ChevronDown size={16} />) : h !== 'Status' && <span className="opacity-30"><ChevronDown size={16} /></span>}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {filteredData.length > 0 ? (
                                        filteredData.map((row, index) => (
                                            <tr key={row['Sample ID'] || index} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-3 text-sm text-gray-700 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span title={`Proband: ${row.proband === '1' ? 'Yes' : 'No'}`}>{row.proband === '1' ? <Dna className="text-green-500" /> : <DnaOff className="text-red-500" />}</span>
                                                        <span title={`Processed: ${row.DataDate !== 'N/A' ? 'Yes' : 'No'}`}>{row.DataDate !== 'N/A' ? <Zap className="text-green-500" /> : <ZapOff className="text-red-500" />}</span>
                                                        <span title={`Analyzed: ${row.geneyx_uploaded === '1' ? 'Yes' : 'No'}`}>{row.geneyx_uploaded === '1' ? <MonitorCheck className="text-green-500" /> : <MonitorOff className="text-red-500" />}</span>
                                                        <span title={`Report: ${row.report === '1' ? 'Yes' : 'No'}`}>{row.report === '1' ? <ClipboardPlus className="text-green-500" /> : <ClipboardMinus className="text-red-500" />}</span>
                                                    </div>
                                                </td>
                                                {visibleColumns.map(h => (
                                                    <td key={`${row['Sample ID']}-${h}`} className={`p-3 text-sm text-gray-700 whitespace-nowrap ${h === 'Sample ID' ? 'font-bold' : ''}`}>{row[h]}</td>
                                                ))}
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={header.length} className="text-center py-8 text-gray-500">No results found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div className="space-y-8">
                        <AnalysisSchedule scheduleData={scheduleData} />
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                             {/* **CHANGE**: Added font-franklin class */}
                             <h2 className="font-franklin text-2xl font-bold text-gray-800 mb-4">Proband Status</h2>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis allowDecimals={false} stackId="a" />
                                        <Tooltip />
                                        <Bar dataKey="Pending" stackId="a" fill="#a1a1aa" name="Pending Analysis" />
                                        <Bar dataKey="Analyzed" stackId="a" fill="#facc15" name="Analyzed" />
                                        <Bar dataKey="Reported" stackId="a" fill="#22c55e" name="Reported" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;

