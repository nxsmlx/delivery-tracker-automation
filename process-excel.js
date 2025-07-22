const XLSX = require('xlsx');
const fs = require('fs');

// Main function to process Excel file and upload to dual databases
async function main() {
    console.log('🚀 Starting Excel processing...');
    
    try {
        // Step 1: Read Excel file
        console.log('📂 Reading Excel file...');
        if (!fs.existsSync('Delivery Tracking -.xlsx')) {
            throw new Error('Excel file "Delivery Tracking -.xlsx" not found');
        }
        
        const workbook = XLSX.readFile('Delivery Tracking -.xlsx');
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        console.log(`📊 Read ${rawData.length} rows from Excel file`);
        
        if (rawData.length === 0) {
            throw new Error('No data found in Excel file');
        }
        
        // Step 2: Debug - show column names
        console.log('🔍 Column names found:', Object.keys(rawData[0]));
        console.log('📋 Sample row:', rawData[0]);
        
        // Step 3: Process and upload data
        await uploadToDualDatabases(rawData);
        
        console.log('✅ Process completed successfully!');
        
    } catch (error) {
        console.error('❌ Process failed:', error.message);
        process.exit(1);
    }
}

// Function to upload data to both Supabase databases
async function uploadToDualDatabases(rawData) {
    console.log('🗄️ Starting dual database upload...');
    
    // Check environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables (SUPABASE_URL or SUPABASE_KEY)');
    }
    
    console.log('✅ Environment variables found');
    
    try {
        // Step 1: Clear both databases
        console.log('🧹 Clearing existing data...');
        await clearDatabases(supabaseUrl, supabaseKey);
        
        // Step 2: Prepare data for both tables
        console.log('🔄 Preparing data...');
        const { analyticsRecords, agingRecords } = prepareData(rawData);
        
        console.log(`📊 Prepared ${analyticsRecords.length} analytics records`);
        console.log(`⏱️ Prepared ${agingRecords.length} aging records`);
        
        // Step 3: Save to both databases
        console.log('💾 Saving to databases...');
        await saveToAnalytics(supabaseUrl, supabaseKey, analyticsRecords);
        await saveToAgingTracker(supabaseUrl, supabaseKey, agingRecords);
        
        // Step 4: Update metadata
        console.log('📝 Updating metadata...');
        await updateMetadata(supabaseUrl, supabaseKey, agingRecords.length, analyticsRecords.length);
        
        console.log('✅ Dual database upload completed successfully!');
        
    } catch (error) {
        console.error('❌ Database upload failed:', error.message);
        throw error;
    }
}

// Clear both databases
async function clearDatabases(supabaseUrl, supabaseKey) {
    const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
    };
    
    try {
        // Clear analytics table
        const analyticsResponse = await fetch(`${supabaseUrl}/rest/v1/delivery_analytics?id=gte.0`, {
            method: 'DELETE',
            headers: headers
        });
        
        // Clear aging tracker table
        const agingResponse = await fetch(`${supabaseUrl}/rest/v1/delivery_data?id=gte.0`, {
            method: 'DELETE',
            headers: headers
        });
        
        console.log('✅ Analytics table cleared:', analyticsResponse.ok);
        console.log('✅ Aging tracker cleared:', agingResponse.ok);
        
    } catch (error) {
        console.error('❌ Error clearing databases:', error);
        throw error;
    }
}

// Prepare data for both tables
function prepareData(rawData) {
    console.log('🔄 Mapping Excel data to database format...');
    
    // Prepare complete analytics data (ALL records)
    const analyticsRecords = rawData.map((row) => {
        const record = {
            ticket_id: String(row['Ticket ID'] || row['ticket_id'] || '').trim(),
            order_received: String(row['Order Received'] || row['order_received'] || '').trim(),
            type: String(row['Type'] || row['Service Type'] || row['type'] || '').trim(),
            urgent: String(row['Urgent'] || row['Urgent?'] || row['urgent'] || 'No').trim(),
            customer: String(row['Customer'] || row['Client'] || row['customer'] || '').trim(),
            aging: parseInt(row['Aging'] || row['aging'] || 0),
            status: parseInt(row['Aging'] || row['aging'] || 0) >= 1 ? 'Pending' : 'Completed',
            updated_by: 'GitHub_Automation'
        };
        
        return record;
    }).filter(record => record.ticket_id); // Only include records with ticket IDs
    
    // Prepare filtered aging data (pending only - aging >= 1)
    const agingRecords = rawData
        .filter(row => parseInt(row['Aging'] || row['aging'] || 0) >= 1)
        .map((row) => {
            const record = {
                ticket_id: String(row['Ticket ID'] || row['ticket_id'] || '').trim(),
                order_received: String(row['Order Received'] || row['order_received'] || '').trim(),
                type: String(row['Type'] || row['Service Type'] || row['type'] || '').trim(),
                urgent: String(row['Urgent'] || row['Urgent?'] || row['urgent'] || 'No').trim(),
                customer: String(row['Customer'] || row['Client'] || row['customer'] || '').trim(),
                aging: parseInt(row['Aging'] || row['aging'] || 0),
                updated_by: 'GitHub_Automation'
            };
            
            return record;
        }).filter(record => record.ticket_id); // Only include records with ticket IDs
    
    console.log('📋 Sample analytics record:', analyticsRecords[0]);
    console.log('📋 Sample aging record:', agingRecords[0]);
    
    return { analyticsRecords, agingRecords };
}

// Save to analytics table (complete data)
async function saveToAnalytics(supabaseUrl, supabaseKey, analyticsRecords) {
    if (analyticsRecords.length === 0) {
        console.log('⚠️ No analytics records to save');
        return;
    }
    
    const response = await fetch(`${supabaseUrl}/rest/v1/delivery_analytics`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(analyticsRecords)
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Analytics save failed (${response.status}): ${error}`);
    }
    
    console.log(`✅ Saved ${analyticsRecords.length} records to analytics table`);
}

// Save to aging tracker table (filtered data)
async function saveToAgingTracker(supabaseUrl, supabaseKey, agingRecords) {
    if (agingRecords.length === 0) {
        console.log('⚠️ No aging records to save (all deliveries completed)');
        return;
    }
    
    const response = await fetch(`${supabaseUrl}/rest/v1/delivery_data`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(agingRecords)
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Aging tracker save failed (${response.status}): ${error}`);
    }
    
    console.log(`✅ Saved ${agingRecords.length} records to aging tracker table`);
}

// Update metadata table with timestamps and counts
async function updateMetadata(supabaseUrl, supabaseKey, agingCount, analyticsCount) {
    try {
        // Create Malaysia timezone timestamp
        const now = new Date();
        const malaysiaTime = new Intl.DateTimeFormat('en-MY', {
            timeZone: 'Asia/Kuala_Lumpur',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }).format(now);
        
        const metadata = {
            last_update: malaysiaTime,
            updated_by: 'GitHub_Automation',
            total_records: agingCount,
            analytics_records: analyticsCount,
            updated_at: now.toISOString()
        };
        
        console.log('📝 Metadata to save:', metadata);
        
        // Try to update existing record
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/delivery_metadata?id=eq.1`, {
            method: 'PATCH',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(metadata)
        });
        
        if (updateResponse.ok) {
            const result = await updateResponse.json();
            if (result.length > 0) {
                console.log('✅ Metadata updated successfully');
                return;
            }
        }
        
        // If update failed, insert new record
        console.log('🔄 Creating new metadata record...');
        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/delivery_metadata`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify([{ id: 1, ...metadata }])
        });
        
        if (insertResponse.ok) {
            console.log('✅ Metadata created successfully');
        } else {
            const error = await insertResponse.text();
            console.error('⚠️ Metadata save failed:', error);
        }
        
    } catch (error) {
        console.error('⚠️ Metadata update error:', error.message);
        // Don't throw - metadata errors shouldn't fail the entire process
    }
}

// Run the main function
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = { main, uploadToDualDatabases };
