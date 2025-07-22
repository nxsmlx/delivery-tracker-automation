async function saveToSupabase(data) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }
    
    console.log('🗄️  Clearing old data from both databases...');
    
    try {
        // Clear both tables with better error handling
        const clearResults = await Promise.allSettled([
            fetch(`${supabaseUrl}/rest/v1/delivery_analytics?id=gte.0`, { // Changed to gte.0
                method: 'DELETE',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                }
            }),
            fetch(`${supabaseUrl}/rest/v1/delivery_data?id=gte.0`, { // Changed to gte.0
                method: 'DELETE',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                }
            })
        ]);
        
        // Check clear results
        clearResults.forEach((result, index) => {
            const tableName = index === 0 ? 'delivery_analytics' : 'delivery_data';
            if (result.status === 'rejected') {
                console.error(`❌ Failed to clear ${tableName}:`, result.reason);
            } else {
                console.log(`✅ Cleared ${tableName} successfully`);
            }
        });
        
        if (data.length === 0) {
            console.log('ℹ️  No data to save');
            return;
        }
        
        // Your existing data preparation code...
        const analyticsRecords = data.map((item) => ({
            ticket_id: item.ticket_id,
            order_received: item.order_received,
            type: item.type || '',
            urgent: item.urgent || 'No',
            customer: item.customer || '',
            aging: parseInt(item.aging) || 0,
            status: parseInt(item.aging) >= 1 ? 'Pending' : 'Completed',
            updated_by: 'GitHub_Automation'
        }));
        
        const agingRecords = data.filter(item => parseInt(item.aging) >= 1);
        
        console.log(`💾 Saving ${analyticsRecords.length} total records and ${agingRecords.length} pending records...`);
        
        // Save with error handling
        const savePromises = [
            fetch(`${supabaseUrl}/rest/v1/delivery_analytics`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
