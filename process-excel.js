const XLSX = require('xlsx');
const fs = require('fs');

// Main function to process Excel file and upload to dual databases
async function main() {
    console.log('🚀 Starting Excel processing...');
    
    try {
        // Step 1: Determine Excel file name from environment or use default
        const fileName = process.env.EXCEL_FILE_NAME || 'delivery-data.xlsx';
        console.log(`📂 Looking for Excel file: ${fileName}`);
        
        // Debug: List all files in current directory
        console.log('📁 Files in current directory:');
        const files = fs.readdirSync('.');
        files.forEach(file => console.log(`  - ${file}`));
        
        // Step 2: Read Excel file
        console.log(`📂 Reading Excel file: ${fileName}...`);
        if (!fs.existsSync(fileName)) {
            throw new Error(`Excel file "${fileName}" not found. Available files: ${files.join(', ')}`);
        }
        
        const workbook = XLSX.readFile(fileName);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        console.log(`📊 Read ${rawData.length} rows from Excel file`);
        
        if (rawData.length === 0) {
            throw new Error('No data found in Excel file');
        }
        
        // Step 3: Debug - show column names
        console.log('🔍 Column names found:', Object.keys(rawData[0]));
        console.log('📋 Sample row:', rawData[0]);
        
        // Step 4: Process and upload data
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
    console.log(`🔗 Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
    
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
        console.log('🧹 Clearing delivery_analytics table...');
        const analyticsResponse = await fetch(`${supabaseUrl}/rest/v1/delivery_analytics?id=gte.0`, {
            method: 'DELETE',
            headers: headers
        });
        
        console.log('🧹 Clearing delivery_data table...');
        const agingResponse = await fetch(`${supabaseUrl}/rest/v1/delivery_data?id=gte.0`, {
            method: 'DELETE',
            headers: headers
        });
        
        console.log(`✅ Analytics table cleared: ${analyticsResponse.ok} (${analyticsResponse.status})`);
        console.log(`✅ Aging tracker cleared: ${agingResponse.ok} (${agingResponse.status})`);
        
        if (!analyticsResponse.ok) {
            const error = await analyticsResponse.text();
            console.warn('⚠️ Analytics clear warning:', error);
        }
        
        if (!agingResponse.ok) {
            const error = await agingResponse.text();
            console.warn('⚠️ Aging tracker clear warning:', error);
        }
        
    } catch (error) {
        console.error('❌ Error clearing databases:', error);
        throw error;
    }
}

// Prepare data for both tables
function prepareData(rawData) {
    console.log('🔄 Mapping Excel data to database format...');
    
    // Get possible column name variations
    const getColumnValue = (row, possibleNames) => {
        for (const name of possibleNames) {
            if (row[name] !== undefined && row[name] !== null) {
                return String(row[name]).trim();
            }
        }
        return '';
    };

    /**
     * Cleans the department name based on predefined rules.
     * @param {string} dept The raw department name from the Excel file.
     * @returns {string} The cleaned department name.
     */
    const cleanDeptName = (dept) => {
        if (!dept) return 'N/A';
        const deptString = String(dept).trim();
        const deptMap = {
            'Proc. Collection': 'PROCUREMENT',
            'QAS SALES': 'SALES',
            'QAS BD': 'BD',
            'RPN': 'RPN',
            'OFFICE ITEM': 'OFFICE',
            'Proc. Document': 'PROCUREMENT',
            'MR DIY': 'MR DIY',
            'PMO': 'PROJECT'
        };
        // Return the mapped value, or the original value (uppercased) if not in the map
        return deptMap[deptString] || deptString.toUpperCase();
    };
    
    // Prepare complete analytics data (ALL records)
    const analyticsRecords = rawData.map((row, index) => {
        const record = {
            ticket_id: getColumnValue(row, ['Ticket ID', 'ticket_id', 'TicketID', 'ID']),
            order_received: getColumnValue(row, ['Order Received', 'order_received', 'Date', 'OrderReceived']),
            type: getColumnValue(row, ['Type', 'Service Type', 'type', 'ServiceType']),
            urgent: getColumnValue(row, ['Urgent', 'Urgent?', 'urgent', 'URGENT']) || 'No',
            customer: getColumnValue(row, ['Customer', 'Client', 'customer', 'CLIENT']),
            dept: cleanDeptName(getColumnValue(row, ['Dept', 'Department', 'dept'])), // Clean and add department
            aging: parseInt(getColumnValue(row, ['Aging', 'aging', 'AGING', 'Days']) || '0'),
            status: parseInt(getColumnValue(row, ['Aging', 'aging', 'AGING', 'Days']) || '0') >= 1 ? 'Pending' : 'Completed',
            updated_by: 'GitHub_Automation'
        };
        
        // Validate required fields
        if (!record.ticket_id) {
            console.warn(`⚠️ Row ${index + 1}: Missing ticket ID, skipping`);
            return null;
        }
        
        return record;
    }).filter(record => record !== null); // Remove invalid records
    
    // Prepare filtered aging data (pending only - aging >= 1)
    const agingRecords = rawData
        .filter((row, index) => {
            const aging = parseInt(getColumnValue(row, ['Aging', 'aging', 'AGING', 'Days']) || '0');
            const ticketId = getColumnValue(row, ['Ticket ID', 'ticket_id', 'TicketID', 'ID']);
            
            if (!ticketId) {
                console.warn(`⚠️ Row ${index + 1}: Missing ticket ID, skipping from aging tracker`);
                return false;
            }
            
            return aging >= 1;
        })
        .map((row) => {
            const record = {
                ticket_id: getColumnValue(row, ['Ticket ID', 'ticket_id', 'TicketID', 'ID']),
                order_received: getColumnValue(row, ['Order Received', 'order_received', 'Date', 'OrderReceived']),
                type: getColumnValue(row, ['Type', 'Service Type', 'type', 'ServiceType']),
                urgent: getColumnValue(row, ['Urgent', 'Urgent?', 'urgent', 'URGENT']) || 'No',
                customer: getColumnValue(row, ['Customer', 'Client', 'customer', 'CLIENT']),
                dept: cleanDeptName(getColumnValue(row, ['Dept', 'Department', 'dept'])), // Clean and add department
                aging: parseInt(getColumnValue(row, ['Aging', 'aging', 'AGING', 'Days']) || '0'),
                updated_by: 'GitHub_Automation'
            };
            
            return record;
        });
    
    console.log('📋 Sample analytics record:', analyticsRecords[0]);
    if (agingRecords.length > 0) {
        console.log('📋 Sample aging record:', agingRecords[0]);
    } else {
        console.log('📋 No aging records (all deliveries completed)');
    }
    
    return { analyticsRecords, agingRecords };
}

// Save to analytics table (complete data)
async function saveToAnalytics(supabaseUrl, supabaseKey, analyticsRecords) {
    if (analyticsRecords.length === 0) {
        console.log('⚠️ No analytics records to save');
        return;
    }
    
    console.log(`💾 Saving ${analyticsRecords.length} records to delivery_analytics table...`);
    
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
        console.error(`❌ Analytics save failed (${response.status}):`, error);
        throw new Error(`Analytics save failed (${response.status}): ${error}`);
    }
    
    const result = await response.json();
    console.log(`✅ Successfully saved ${result.length || analyticsRecords.length} records to analytics table`);
}

// Save to aging tracker table (filtered data)
async function saveToAgingTracker(supabaseUrl, supabaseKey, agingRecords) {
    if (agingRecords.length === 0) {
        console.log('⚠️ No aging records to save (all deliveries completed)');
        return;
    }
    
    console.log(`💾 Saving ${agingRecords.length} records to delivery_data table...`);
    
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
        console.error(`❌ Aging tracker save failed (${response.status}):`, error);
        throw new Error(`Aging tracker save failed (${response.status}): ${error}`);
    }
    
    const result = await response.json();
    console.log(`✅ Successfully saved ${result.length || agingRecords.length} records to aging tracker table`);
}

// Update metadata table with timestamps and counts
async function updateMetadata(supabaseUrl, supabaseKey, agingCount, analyticsCount) {
    try {
        console.log('📝 Preparing metadata update...');
        
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
        console.log('🔄 Attempting to update existing metadata...');
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
