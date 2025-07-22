async function saveToSupabase(data) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    
    console.log('🗄️  Clearing old data from both databases...');
    
    try {
        // Clear both tables
        const clearPromises = [
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
        ];
        
        await Promise.all(clearPromises);
        console.log('✅ Both databases cleared successfully');
        
        if (data.length === 0) {
            console.log('ℹ️  No data to save');
            await updateMetadata(supabaseUrl, supabaseKey, 0, 0);
            return;
        }
        
        // ✅ FIXED: Use actual Excel column names
        const analyticsRecords = data.map((item) => ({
            ticket_id: item['Ticket ID'] || item['ticket_id'] || item.ticketId || '',
            order_received: item['Order Received'] || item['order_received'] || item.orderReceived || '',
            type: item['Type'] || item['Service Type'] || item.type || '',
            urgent: item['Urgent'] || item['Urgent?'] || item.urgent || 'No',
            customer: item['Customer'] || item['Client'] || item.customer || '',
            aging: parseInt(item['Aging'] || item.aging || 0),
            status: parseInt(item['Aging'] || item.aging || 0) >= 1 ? 'Pending' : 'Completed',
            updated_by: 'GitHub_Automation'
        }));
        
        // ✅ FIXED: Filter using correct field mapping
        const agingRecords = analyticsRecords.filter(item => item.aging >= 1);
        
        console.log(`💾 Saving ${analyticsRecords.length} total records and ${agingRecords.length} pending records...`);
        console.log('📋 Sample record:', analyticsRecords[0]); // Debug log
        
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
        
        const saveResults = await Promise.all(savePromises);
        
        // Check if saves were successful
        for (let i = 0; i < saveResults.length; i++) {
            if (!saveResults[i].ok) {
                const errorText = await saveResults[i].text();
                console.error(`❌ Save operation ${i + 1} failed:`, errorText);
                throw new Error(`Save operation ${i + 1} failed: ${saveResults[i].status}`);
            }
        }
        
        console.log('✅ Data saved to both databases successfully');
        
        // Update metadata with better error handling
        await updateMetadata(supabaseUrl, supabaseKey, agingRecords.length, analyticsRecords.length);
        
        console.log(`📊 Analytics: ${analyticsRecords.length} records, Aging: ${agingRecords.length} records`);
        
    } catch (error) {
        console.error('❌ Error in saveToSupabase:', error);
        throw error;
    }
}
