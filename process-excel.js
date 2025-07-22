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
        
        const saveResults = await Promise.all(savePromises);
        
        // Check if saves were successful
        for (let i = 0; i < saveResults.length; i++) {
            if (!saveResults[i].ok) {
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

// Separate metadata update function with better error handling
async function updateMetadata(supabaseUrl, supabaseKey, agingCount, analyticsCount) {
    try {
        console.log('📝 Updating metadata...');
        
        // Use Malaysia timezone
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
        
        console.log('Metadata to save:', metadata);
        
        // Try to update existing record first
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
        
        // If update failed, try to insert new record
        console.log('🔄 Update failed, inserting new metadata record...');
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
            console.log('✅ Metadata inserted successfully');
        } else {
            throw new Error(`Metadata insert failed: ${insertResponse.status}`);
        }
        
    } catch (error) {
        console.error('❌ Error updating metadata:', error);
        // Don't throw here - we don't want metadata errors to fail the entire operation
    }
}
