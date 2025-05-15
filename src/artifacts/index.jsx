import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

const OpenAIAssistantDebugger = () => {
  // Format functions - defined at the very top
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    // Remove .000 if milliseconds are zero
    const milliseconds = date.getMilliseconds();
    if (milliseconds === 0) {
      return date.toLocaleTimeString();
    }
    return date.toLocaleTimeString() + '.' + milliseconds.toString().padStart(3, '0');
  };

  const formatDuration = (ms) => {
    if (!ms || isNaN(ms)) return 'N/A';
    
    // Format as milliseconds for very short durations
    if (ms < 1000) return `${Math.round(ms)}ms`;
    
    // Convert to seconds
    const totalSeconds = ms / 1000;
    
    // Format as seconds if less than 60 seconds
    if (totalSeconds < 60) {
      // Remove decimal for whole seconds
      return `${Math.floor(totalSeconds) === totalSeconds ? 
        Math.floor(totalSeconds) : 
        totalSeconds.toFixed(1)}s`;
    }
    
    // Format as minutes and seconds for longer durations
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    
    // Only include seconds if they're non-zero
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  };

  // Create D3 Waterfall Timeline component
  const WaterfallTimeline = ({ data, runStart, runEnd, onStepClick }) => {
    const svgRef = useRef();
    const tooltipRef = useRef();
    
    useEffect(() => {
      if (!data || data.length === 0) return;
      
      // Clear any existing SVG content
      d3.select(svgRef.current).selectAll("*").remove();
      
      // Set up dimensions and margins
      const margin = { top: 20, right: 40, bottom: 30, left: 160 };
      const width = svgRef.current.clientWidth - margin.left - margin.right;
      const height = data.length * 40; // Height depends on number of steps
      
      // Create the SVG container
      const svg = d3.select(svgRef.current)
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
      
      // Set up scales
      const x = d3.scaleLinear()
        .domain([0, runEnd - runStart])
        .range([0, width]);
      
      const y = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([0, height])
        .padding(0.3);
      
      // Add X axis
      svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x)
          .tickFormat(d => formatDuration(d))
          .ticks(5)
        );
      
      // Add Y axis
      svg.append("g")
        .call(d3.axisLeft(y))
        .selectAll(".tick text")
        .style("font-size", "12px")
        .attr("fill", d => {
          const dataItem = data.find(item => item.name === d);
          return dataItem && dataItem.isGap ? "#999" : "#333";
        });
      
      // Create a tooltip
      const tooltip = d3.select(tooltipRef.current)
        .style("opacity", 0)
        .attr("class", "bg-white p-2 border border-gray-300 rounded shadow-md absolute pointer-events-none z-50");
      
      // Color scale
      const colorScale = d3.scaleOrdinal()
        .domain(data.map(d => d.index))
        .range(['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe']);
      
      // Add bars
      svg.selectAll(".bar")
        .data(data)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("y", d => y(d.name))
        .attr("x", d => x(d.actualStart))
        .attr("width", d => Math.max(x(d.duration), 1)) // Ensure at least 1px width
        .attr("height", y.bandwidth())
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("fill", d => {
          if (d.isGap) return "#e0e0e0";
          return d.isSelected ? "#ff0000" : colorScale(d.index);
        })
        .style("cursor", d => d.isGap ? "default" : "pointer")
        .style("stroke", d => d.isGap ? "#ccc" : "none")
        .style("stroke-dasharray", d => d.isGap ? "3,2" : "none")
        .on("click", (event, d) => {
          if (!d.isGap) onStepClick(d.index);
        })
        .on("mouseover", (event, d) => {
          tooltip.transition()
            .duration(200)
            .style("opacity", 0.9);
          tooltip.html(`
            <div>
              <p class="font-semibold">${d.isGap ? "Gap" : d.name}</p>
              <p>Start: ${formatDuration(d.actualStart)}</p>
              <p>End: ${formatDuration(d.actualEnd)}</p>
              <p>Duration: ${formatDuration(d.duration)}</p>
            </div>
          `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => {
          tooltip.transition()
            .duration(500)
            .style("opacity", 0);
        });
      
      // Add duration labels inside bars
      svg.selectAll(".label")
        .data(data)
        .enter()
        .append("text")
        .attr("class", "label")
        .attr("x", d => x(d.actualStart) + x(d.duration) / 2)
        .attr("y", d => y(d.name) + y.bandwidth() / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", d => d.isGap ? "#666" : "white")
        .attr("font-weight", "bold")
        .attr("font-size", "12px")
        .style("pointer-events", "none") // Make sure labels don't interfere with clicks
        .text(d => x(d.duration) > 35 ? formatDuration(d.duration) : "")
        .each(function(d) {
          // Check if text width exceeds bar width and hide if necessary
          const textWidth = this.getComputedTextLength();
          if (textWidth > x(d.duration) - 10) {
            d3.select(this).text("");
          }
        });
        
    }, [data, runStart, runEnd, onStepClick]);
    
    return (
      <div className="relative w-full h-full">
        <svg ref={svgRef} className="w-full h-full" />
        <div ref={tooltipRef} />
      </div>
    );
  };

  const [runId, setRunId] = useState(() => localStorage.getItem('openai_debug_run_id') || '');
  const [threadId, setThreadId] = useState(() => localStorage.getItem('openai_debug_thread_id') || '');
  const [assistantId, setAssistantId] = useState(() => localStorage.getItem('openai_debug_assistant_id') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_debug_api_key') || '');
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem('openai_debug_mode') === 'true');
  const [debugInfo, setDebugInfo] = useState(null);
  const [runData, setRunData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState(null);
  
  const stepRefs = useRef({});

  // Save values to localStorage when they change
  useEffect(() => {
    if (runId) localStorage.setItem('openai_debug_run_id', runId);
    if (threadId) localStorage.setItem('openai_debug_thread_id', threadId);
    if (assistantId) localStorage.setItem('openai_debug_assistant_id', assistantId);
    if (apiKey) localStorage.setItem('openai_debug_api_key', apiKey);
    localStorage.setItem('openai_debug_mode', debugMode);
  }, [runId, threadId, assistantId, apiKey, debugMode]);

  const prepareTimelineData = () => {
    if (!runData || !runData.steps || runData.steps.length === 0) return [];
    
    const startTime = runData.started_at;
    const endTime = runData.completed_at;
    const result = [];
    
    // Check for initial gap between run start and first step
    if (runData.steps.length > 0) {
      const firstStep = runData.steps[0];
      if (firstStep.started_at > startTime) {
        const gapDuration = firstStep.started_at - startTime;
        result.push({
          name: `<unknown>`,
          actualStart: 0,
          duration: gapDuration,
          actualEnd: gapDuration,
          index: -1, // Special index for gaps
          isGap: true,
          durationLabel: formatDuration(gapDuration)
        });
      }
    }
    
    // Process all steps and add gaps between them
    runData.steps.forEach((step, index) => {
      // Add the current step
      const actualStart = step.started_at - startTime;
      const actualEnd = step.completed_at ? step.completed_at - startTime : (endTime - startTime);
      const duration = actualEnd - actualStart;
      
      result.push({
        name: `${index + 1}. ${step.type || 'Unknown'}`,
        actualStart,
        duration,
        actualEnd,
        index,
        isSelected: selectedStepIndex === index,
        isGap: false,
        durationLabel: formatDuration(duration)
      });
      
      // Check for gap after this step
      const nextStep = index < runData.steps.length - 1 ? runData.steps[index + 1] : null;
      if (nextStep && step.completed_at < nextStep.started_at) {
        const gapStart = step.completed_at - startTime;
        const gapEnd = nextStep.started_at - startTime;
        const gapDuration = gapEnd - gapStart;
        
        result.push({
          name: `<unknown>`,
          actualStart: gapStart,
          duration: gapDuration,
          actualEnd: gapEnd,
          index: -1, // Special index for gaps
          isGap: true,
          durationLabel: formatDuration(gapDuration)
        });
      }
    });
    
    // Check for gap after the last step to the end of the run
    const lastStep = runData.steps[runData.steps.length - 1];
    if (lastStep && lastStep.completed_at < endTime) {
      const gapStart = lastStep.completed_at - startTime;
      const gapDuration = endTime - lastStep.completed_at;
      
      result.push({
        name: `<unknown>`,
        actualStart: gapStart,
        duration: gapDuration,
        actualEnd: endTime - startTime,
        index: -1, // Special index for gaps
        isGap: true,
        durationLabel: formatDuration(gapDuration)
      });
    }
    
    return result;
  };

  const fetchRunData = async () => {
    if (!runId || !threadId || !apiKey) {
      setError('Run ID, Thread ID, and API Key are required');
      return;
    }

    setLoading(true);
    setError(null);
    setDebugInfo(null);
    
    try {
      // First, get the run details to find out when it started and completed
      let runInfo;
      const runUrl = `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`;
      
      // Clear and initialize debug info
      if (debugMode) {
        setDebugInfo({
          runUrl,
          runHeaders: {
            'Authorization': `Bearer ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        });
      }
      
      try {
        const runResponse = await fetch(runUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        });
        
        const responseText = await runResponse.text();
        let responseJson = null;
        
        try {
          responseJson = JSON.parse(responseText);
        } catch (e) {
          // Response wasn't valid JSON
        }
        
        if (debugMode) {
          setDebugInfo(prevInfo => ({
            ...prevInfo,
            runStatus: runResponse.status,
            runStatusText: runResponse.statusText,
            runResponse: responseJson || responseText
          }));
        }
        
        if (!runResponse.ok) {
          throw new Error(`Run API request failed with status ${runResponse.status}: ${responseText}`);
        }
        
        runInfo = responseJson;
      } catch (err) {
        console.error("Error fetching run:", err);
        throw new Error(`Error fetching run details: ${err.message || 'Network error'}`);
      }
      
      // Then fetch all run steps
      let stepsData;
      const stepsUrl = `https://api.openai.com/v1/threads/${threadId}/runs/${runId}/steps?limit=100`;
      
      // Update debug info for steps request
      if (debugMode) {
        // Use a callback to ensure we're updating the latest state
        setDebugInfo(prevInfo => {
          // Make sure prevInfo exists and create a deep copy to avoid state mutation issues
          const updatedInfo = prevInfo ? {...prevInfo} : {};
          
          return {
            ...updatedInfo,
            stepsUrl,
            stepsHeaders: {
              'Authorization': `Bearer ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`,
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'assistants=v2'
            }
          };
        });
        
        // Log to console to verify the URL is correct
        console.log("Steps URL:", stepsUrl);
      }
      
      try {
        const stepsResponse = await fetch(stepsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          }
        });
        
        const responseText = await stepsResponse.text();
        let responseJson = null;
        
        try {
          responseJson = JSON.parse(responseText);
        } catch (e) {
          // Response wasn't valid JSON
        }
        
        if (debugMode) {
          setDebugInfo(prevInfo => ({
            ...prevInfo,
            stepsStatus: stepsResponse.status,
            stepsStatusText: stepsResponse.statusText,
            stepsResponse: responseJson || responseText
          }));
        }
        
        if (!stepsResponse.ok) {
          throw new Error(`Steps API request failed with status ${stepsResponse.status}: ${responseText}`);
        }
        
        stepsData = responseJson;
      } catch (err) {
        console.error("Error fetching steps:", err);
        throw new Error(`Error fetching run steps: ${err.message || 'Network error'}`);
      }
      
      // Transform Unix timestamps to JavaScript milliseconds
      const transformedSteps = stepsData.data.map(step => ({
        ...step,
        // Convert Unix timestamps (seconds) to JavaScript timestamps (milliseconds)
        started_at: step.created_at * 1000,
        completed_at: step.completed_at ? step.completed_at * 1000 : null
      }));
      
      // Sort steps by created_at to ensure they're in chronological order
      transformedSteps.sort((a, b) => a.created_at - b.created_at);
      
      const processedData = {
        id: runInfo.id,
        thread_id: runInfo.thread_id,
        assistant_id: runInfo.assistant_id || assistantId,
        status: runInfo.status,
        started_at: runInfo.created_at * 1000, // Convert Unix timestamp to JavaScript milliseconds
        completed_at: runInfo.completed_at ? runInfo.completed_at * 1000 : Date.now(),
        steps: transformedSteps
      };
      
      setRunData(processedData);
    } catch (err) {
      setError(`Error: ${err.message || 'Unknown error occurred'}`);
      console.error("Detailed error:", err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToStep = (index) => {
    setSelectedStepIndex(index);
    if (stepRefs.current[index]) {
      stepRefs.current[index].scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const timelineData = prepareTimelineData();

  // Helper function to safely render step details
  const renderStepDetails = (step) => {
    // Safety check if step details is undefined
    if (!step || !step.step_details) {
      return <p>No step details available</p>;
    }

    const details = step.step_details;
    const detailType = details.type;

    // Handle tool calls
    if (detailType === 'tool_calls' && details.tool_calls && Array.isArray(details.tool_calls)) {
      return (
        <div>
          <p className="mb-2">
            <span className="font-medium">Tool Calls:</span> {details.tool_calls.length}
          </p>
          {details.tool_calls.map((toolCall, toolIndex) => {
            if (!toolCall) return null;
            
            return (
              <div key={toolCall.id || `tool-${toolIndex}`} className="mb-4 p-3 bg-white rounded border border-gray-200">
                <p className="font-medium">Tool Call {toolIndex + 1}: {toolCall.type || 'Unknown Type'}</p>
                
                {/* Function tool call */}
                {toolCall.type === 'function' && toolCall.function && (
                  <div className="mt-2">
                    <p><span className="font-semibold">Function:</span> {toolCall.function.name || 'Unnamed'}</p>
                    <p className="mt-1"><span className="font-semibold">Arguments:</span></p>
                    <pre className="mt-1 bg-gray-50 p-2 rounded overflow-auto text-sm">
                      {(() => {
                        try {
                          return JSON.stringify(
                            JSON.parse(toolCall.function.arguments || '{}'), 
                            null, 
                            2
                          );
                        } catch (e) {
                          return toolCall.function.arguments || '{}';
                        }
                      })()}
                    </pre>
                  </div>
                )}
                
                {/* Code interpreter tool call */}
                {toolCall.type === 'code_interpreter' && toolCall.code_interpreter && (
                  <div className="mt-2">
                    <p className="mt-1"><span className="font-semibold">Input:</span></p>
                    <pre className="mt-1 bg-gray-50 p-2 rounded overflow-auto text-sm">
                      {toolCall.code_interpreter.input || 'No input provided'}
                    </pre>
                    
                    {toolCall.code_interpreter.outputs && 
                     Array.isArray(toolCall.code_interpreter.outputs) && 
                     toolCall.code_interpreter.outputs.length > 0 && (
                      <div className="mt-2">
                        <p className="font-semibold">Outputs:</p>
                        {toolCall.code_interpreter.outputs.map((output, i) => {
                          if (!output) return null;
                          
                          return (
                            <div key={i} className="mt-1">
                              {output.type === 'text' && (
                                <pre className="bg-gray-50 p-2 rounded overflow-auto text-sm">
                                  {output.text}
                                </pre>
                              )}
                              {output.type === 'image' && output.image && output.image.data && (
                                <div className="mt-1">
                                  <img 
                                    src={`data:image/png;base64,${output.image.data}`} 
                                    alt="Code output" 
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Retrieval tool call */}
                {toolCall.type === 'retrieval' && (
                  <div className="mt-2">
                    <p><span className="font-semibold">Retrieval:</span> File search performed</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    } 
    // Handle message creation
    else if (detailType === 'message_creation' && details.message_creation) {
      return (
        <div>
          <p>
            <span className="font-semibold">Message ID:</span> {
              details.message_creation.message_id || 'Unknown Message ID'
            }
          </p>
        </div>
      );
    } 
    // Default case - just render the JSON
    else {
      return (
        <pre className="overflow-auto">
          {JSON.stringify(details, null, 2)}
        </pre>
      );
    }
  };

  return (
    <div className="flex flex-col h-screen p-4 bg-gray-50">
      {/* Input Form */}
      <div className="mb-4 p-4 bg-white rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Thread ID</label>
            <input
              type="text"
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="thread_abc123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Run ID</label>
            <input
              type="text"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="run_abc123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assistant ID (optional)</label>
            <input
              type="text"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="asst_abc123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="sk-..."
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <button
            onClick={fetchRunData}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? 'Loading...' : 'Fetch Run Data'}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('openai_debug_run_id');
              localStorage.removeItem('openai_debug_thread_id');
              localStorage.removeItem('openai_debug_assistant_id');
              localStorage.removeItem('openai_debug_api_key');
              setRunId('');
              setThreadId('');
              setAssistantId('');
              setApiKey('');
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Clear Saved Data
          </button>
          <div className="flex items-center ml-4">
            <input
              type="checkbox"
              id="debugToggle"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="debugToggle" className="ml-2 block text-sm text-gray-900">
              Debug Mode
            </label>
          </div>
        </div>
        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 border border-red-200 rounded">
            <div className="font-semibold">Error:</div>
            <div className="whitespace-pre-wrap">{error}</div>
          </div>
        )}
        
        {/* Debug Information */}
        {debugMode && debugInfo && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded">
            <div className="font-semibold mb-2">Debug Information:</div>
            
            <div className="mb-4">
              <h3 className="font-medium text-lg mb-1">Run Request:</h3>
              <p className="mb-1"><span className="font-medium">URL:</span> {debugInfo.runUrl}</p>
              <p className="mb-1"><span className="font-medium">Headers:</span></p>
              <pre className="bg-gray-100 p-2 rounded text-sm mb-2 overflow-auto">
                {JSON.stringify(debugInfo.runHeaders, null, 2)}
              </pre>
              
              {debugInfo.runStatus && (
                <>
                  <p className="mb-1">
                    <span className="font-medium">Status:</span> {debugInfo.runStatus} {debugInfo.runStatusText}
                  </p>
                  <p className="mb-1"><span className="font-medium">Response:</span></p>
                  <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-40">
                    {typeof debugInfo.runResponse === 'object' 
                      ? JSON.stringify(debugInfo.runResponse, null, 2) 
                      : debugInfo.runResponse}
                  </pre>
                </>
              )}
            </div>
            
            <div>
              <h3 className="font-medium text-lg mb-1">Steps Request:</h3>
              <p className="mb-1"><span className="font-medium">URL:</span> {debugInfo.stepsUrl}</p>
              <p className="mb-1"><span className="font-medium">Headers:</span></p>
              <pre className="bg-gray-100 p-2 rounded text-sm mb-2 overflow-auto">
                {JSON.stringify(debugInfo.stepsHeaders, null, 2)}
              </pre>
              
              {debugInfo.stepsStatus && (
                <>
                  <p className="mb-1">
                    <span className="font-medium">Status:</span> {debugInfo.stepsStatus} {debugInfo.stepsStatusText}
                  </p>
                  <p className="mb-1"><span className="font-medium">Response:</span></p>
                  <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto max-h-40">
                    {typeof debugInfo.stepsResponse === 'object' 
                      ? JSON.stringify(debugInfo.stepsResponse, null, 2) 
                      : debugInfo.stepsResponse}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content area */}
      {runData && (
        <div className="flex flex-col flex-grow">
          <div className="text-lg font-semibold mb-2">
            Run Timeline
          </div>
          
          {/* Timeline panel - keep this fixed at the top */}
          <div className="h-64 bg-white p-4 rounded-lg shadow mb-4 sticky top-0 z-10">
            <WaterfallTimeline 
              data={timelineData} 
              runStart={runData.started_at}
              runEnd={runData.completed_at}
              onStepClick={scrollToStep}
            />
          </div>
          
          {/* Split into separate containers - run summary and details */}
          <div className="flex flex-col flex-grow overflow-hidden">
            {/* Run summary section */}
            <div className="flex-shrink-0 mb-4">
              <div className="text-lg font-semibold mb-2">
                Run Details
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <p><span className="font-semibold">Run ID:</span> {runData.id}</p>
                  <p><span className="font-semibold">Thread ID:</span> {runData.thread_id}</p>
                  <p><span className="font-semibold">Assistant ID:</span> {runData.assistant_id}</p>
                  <p><span className="font-semibold">Status:</span> {runData.status}</p>
                  <p><span className="font-semibold">Started:</span> {formatTime(runData.started_at)}</p>
                  <p><span className="font-semibold">Completed:</span> {formatTime(runData.completed_at)}</p>
                  <p><span className="font-semibold">Total Duration:</span> {formatDuration(runData.completed_at - runData.started_at)}</p>
                </div>
              </div>
            </div>
            
            {/* Steps section - this is the part that scrolls */}
            <div className="text-lg font-semibold mb-2">Steps</div>
            <div className="flex-grow overflow-auto">
              {runData.steps.map((step, index) => (
                <div 
                  key={step.id}
                  ref={el => stepRefs.current[index] = el}
                  className={`mb-4 p-4 bg-white border rounded-lg shadow ${selectedStepIndex === index ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                >
                  <h3 className="text-lg font-medium">{index + 1}. {step.type || 'Unknown Step Type'}</h3>
                  <p><span className="font-semibold">Status:</span> {step.status || 'Unknown'}</p>
                  <p><span className="font-semibold">Started:</span> {formatTime(step.started_at)}</p>
                  <p><span className="font-semibold">Completed:</span> {formatTime(step.completed_at)}</p>
                  <p><span className="font-semibold">Duration:</span> {formatDuration(step.completed_at - step.started_at)}</p>
                  
                  <div className="mt-2">
                    <p className="font-semibold">Details:</p>
                    <div className="mt-1 bg-gray-100 p-2 rounded overflow-auto max-h-96">
                      {renderStepDetails(step)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenAIAssistantDebugger;