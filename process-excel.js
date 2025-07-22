async function saveToSupabase(data) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    console.log('🗄️  Clearing old data from both databases...');
    
    // Clear both tables
    await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/delivery_analytics?id=gte.1`, {
            method: 'DELETE',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        }),
        fetch(`${supabaseUrl}/rest/v1/delivery_data?id=gte.1`, {
            method: 'DELETE',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        })
    ]);
    
    if (data.length === 0) {
        console.log('ℹ️  No data to save');
        return;
    }
    
    // Prepare complete analytics data (ALL records)
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
    
    // Prepare filtered aging data (pending only)
    const agingRecords = data.filter(item => parseInt(item.aging) >= 1);
    
    console.log(`💾 Saving ${analyticsRecords.length} total records and ${agingRecords.length} pending records...`);
    
    // Save to both tables
    const savePromises = [
        // Save complete data to analytics
        fetch(`${supabaseUrl}/rest/v1/delivery_analytics`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(analyticsRecords)
        })
    ];
    
    // Save filtered data to aging tracker (only if there are pending records)
    if (agingRecords.length > 0) {
        savePromises.push(
            fetch(`${supabaseUrl}/rest/v1/delivery_data`, {
                method: 'POST',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(agingRecords)
            })
        );
    }
    
    await Promise.all(savePromises);
    
    // Update metadata
    const metadata = {
        last_update: new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }),
        updated_by: 'GitHub_Automation',
        total_records: agingRecords.length,
        analytics_records: analyticsRecords.length,
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
    
    console.log('✅ Data saved to both databases successfully');
    console.log(`📊 Analytics: ${analyticsRecords.length} records, Aging: ${agingRecords.length} records`);
}
