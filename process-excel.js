const XLSX = require('xlsx');
// Using built-in fetch (Node 18+ has built-in fetch)

async function downloadAndProcessExcel() {
    try {
        console.log('🔄 Starting Excel sync process...');
        
        // Download Excel file
        console.log('📥 Downloading Excel file...');
        const response = await fetch(process.env.EXCEL_FILE_URL);
        
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`✅ Downloaded ${buffer.length} bytes`);
        
        // Parse Excel file
        console.log('📊 Parsing Excel data...');
        const workbook = XLSX.read(buffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log(`📋 Found ${jsonData.length} rows of data`);
        
        // Process data (same logic as your web app)
        const processedData = parseExcelData(jsonData);
        console.log(`✅ Processed ${processedData.length} valid records`);
        
        // Save to Supabase
        await saveToSupabase(processedData);
        
        console.log('🎉 Sync completed successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

function parseExcelData(jsonData) {
    if (jsonData.length === 0) throw new Error('No data found in Excel file');
    
    const headers = jsonData[0].map(h => String(h).toLowerCase());
    const rows = jsonData.slice(1);
    
    // Find columns (same logic as your web app)
    const findColumn = (possibleNames) => 
        possibleNames.reduce((acc, name) => acc !== -1 ? acc : headers.indexOf(name), -1);

    const ticketIdCol = findColumn(['ticket id', 'ticketid', 'ticket']);
    const orderReceivedCol = findColumn(['order received', 'orderreceived', 'date']);
    const typeCol = findColumn(['type', 'service type']);
    const urgentCol = findColumn(['urgent', 'urgent?']);
    const customerCol = findColumn(['customer', 'client']);
    const agingCol = findColumn(['aging']);

    if (ticketIdCol === -1 || agingCol === -1) {
        throw new Error('Excel file must contain "Ticket ID" and "Aging" columns');
    }

    return rows.map(row => ({
        ticket_id: String(row[ticketIdCol] || ''),
        order_received: convertExcelDate(row[orderReceivedCol] || ''),
        type: String(row[typeCol] || ''),
        urgent: String(row[urgentCol] || 'No'),
        customer: String(row[customerCol] || ''),
        aging: parseInt(row[agingCol]) || 0,
        updated_by: 'GitHub_Automation'
    })).filter(item => item.ticket_id && item.aging >= 1);
}

function convertExcelDate(serialNumber) {
    if (!serialNumber || isNaN(serialNumber)) return serialNumber;
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + parseInt(serialNumber) * 24 * 60 * 60 * 1000);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

async function saveToSupabase(data) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    console.log('🗄️  Clearing old data...');
    
    // Clear existing data
    await fetch(`${supabaseUrl}/rest/v1/delivery_data?id=gte.1`, {
        method: 'DELETE',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (data.length === 0) {
        console.log('ℹ️  No data to save');
        return;
    }
    
    console.log(`💾 Saving ${data.length} records...`);
    
    // Insert new data
    const response = await fetch(`${supabaseUrl}/rest/v1/delivery_data`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Database error: ${response.status} - ${error}`);
    }
    
    // Update metadata
    const metadata = {
        last_update: new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }),
        updated_by: 'GitHub_Automation',
        total_records: data.length,
        updated_at: new Date().toISOString()
    };
    
    await fetch(`${supabaseUrl}/rest/v1/delivery_metadata?id=eq.1`, {
        method: 'PATCH',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });
    
    console.log('✅ Data saved to Supabase successfully');
}

// Run the function
downloadAndProcessExcel();
