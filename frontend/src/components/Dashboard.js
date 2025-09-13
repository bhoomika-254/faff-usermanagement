import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spinner, Alert, Button, Form } from 'react-bootstrap';
import { FaUsers, FaCheck, FaClock, FaTimes, FaPercentage, FaPlay, FaRedo } from 'react-icons/fa';
import { memoryAPI } from '../services/api';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [processingResult, setProcessingResult] = useState(null);
  const [forceReprocess, setForceReprocess] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await memoryAPI.getSystemStats();
      setStats(response.data);
    } catch (err) {
      setError('Failed to load system statistics');
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessAllJsons = async () => {
    try {
      setProcessingLoading(true);
      setProcessingResult(null);
      const response = await memoryAPI.processAllJsons(forceReprocess);
      setProcessingResult({
        success: true,
        message: response.data.message,
        details: response.data
      });
      // Refresh stats after processing
      await fetchStats();
    } catch (err) {
      setProcessingResult({
        success: false,
        message: 'Failed to process JSONs: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setProcessingLoading(false);
    }
  };

  const handleProcessSingleJson = async (userId) => {
    try {
      setProcessingLoading(true);
      setProcessingResult(null);
      const response = await memoryAPI.processSingleJson(userId, forceReprocess);
      setProcessingResult({
        success: true,
        message: `Successfully processed ${userId}: ${response.data.total_nodes_extracted} nodes extracted`,
        details: response.data
      });
      // Refresh stats after processing
      await fetchStats();
    } catch (err) {
      setProcessingResult({
        success: false,
        message: `Failed to process ${userId}: ` + (err.response?.data?.detail || err.message)
      });
    } finally {
      setProcessingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div>
      <h1 className="mb-4">System Dashboard</h1>
      
      <Row className="g-4">
        <Col md={3}>
          <Card className="stats-card text-center">
            <Card.Body>
              <FaUsers size={30} className="mb-2" />
              <h3 className="mb-0">{stats?.total_users || 0}</h3>
              <small>Total Users</small>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={3}>
          <Card className="bg-success text-white text-center">
            <Card.Body>
              <FaCheck size={30} className="mb-2" />
              <h3 className="mb-0">{stats?.approved_nodes || 0}</h3>
              <small>Approved Facts</small>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={3}>
          <Card className="bg-warning text-white text-center">
            <Card.Body>
              <FaClock size={30} className="mb-2" />
              <h3 className="mb-0">{stats?.pending_nodes || 0}</h3>
              <small>Pending Review</small>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={3}>
          <Card className="bg-danger text-white text-center">
            <Card.Body>
              <FaTimes size={30} className="mb-2" />
              <h3 className="mb-0">{stats?.rejected_nodes || 0}</h3>
              <small>Rejected Facts</small>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Processing Controls */}
      <Row className="mt-4">
        <Col md={12}>
          <Card>
            <Card.Header>
              <h5 className="mb-0">🚀 JSON Processing Controls</h5>
            </Card.Header>
            <Card.Body>
              {/* Force Reprocess Option */}
              <Row className="mb-3">
                <Col md={12}>
                  <Form.Check
                    type="checkbox"
                    id="force-reprocess"
                    label="🔄 Force Reprocess (ignore already processed files)"
                    checked={forceReprocess}
                    onChange={(e) => setForceReprocess(e.target.checked)}
                    className="text-warning"
                  />
                  <small className="text-muted d-block mt-1">
                    {forceReprocess 
                      ? "⚠️ Will reprocess ALL files, even if already processed" 
                      : "✅ Will skip files that have already been processed"
                    }
                  </small>
                </Col>
              </Row>
              
              <Row>
                <Col md={6}>
                  <div className="text-center">
                    <h6>Process All Input JSONs</h6>
                    <p className="text-muted small">
                      Process all JSON files in input_jsons/ directory and extract memory facts
                    </p>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleProcessAllJsons}
                      disabled={processingLoading}
                      className="mb-2"
                    >
                      {processingLoading ? (
                        <>
                          <Spinner size="sm" animation="border" className="me-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <FaPlay className="me-2" />
                          Process All JSONs
                        </>
                      )}
                    </Button>
                  </div>
                </Col>
                <Col md={6}>
                  <div className="text-center">
                    <h6>Quick Process Individual User</h6>
                    <p className="text-muted small">
                      Process a single user for testing (AdityaShetty)
                    </p>
                    <Button
                      variant="outline-primary"
                      size="lg"
                      onClick={() => handleProcessSingleJson('AdityaShetty')}
                      disabled={processingLoading}
                      className="mb-2"
                    >
                      {processingLoading ? (
                        <>
                          <Spinner size="sm" animation="border" className="me-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <FaRedo className="me-2" />
                          Process AdityaShetty
                        </>
                      )}
                    </Button>
                  </div>
                </Col>
              </Row>
              
              {/* Processing Result */}
              {processingResult && (
                <Row className="mt-3">
                  <Col md={12}>
                    <Alert variant={processingResult.success ? 'success' : 'danger'}>
                      <strong>{processingResult.success ? '✅ Success!' : '❌ Error!'}</strong>
                      <br />
                      {processingResult.message}
                      {processingResult.details && processingResult.success && (
                        <div className="mt-2 small">
                          <strong>Details:</strong>
                          <ul className="mb-0 mt-1">
                            {processingResult.details.total_files_processed ? (
                              <>
                                <li>Files processed: {processingResult.details.total_files_processed}</li>
                                <li>Total extractions: {Object.values(processingResult.details.results || {})
                                  .reduce((sum, result) => sum + (result.total_nodes_extracted || 0), 0)}</li>
                              </>
                            ) : (
                              <>
                                <li>New facts extracted this iteration: {processingResult.details.total_nodes_extracted}</li>
                                <li>By layer: {Object.entries(processingResult.details.layers || {})
                                  .map(([layer, count]) => `${layer}: ${count}`)
                                  .join(', ')}</li>
                                {processingResult.details.note && (
                                  <li className="text-muted">{processingResult.details.note}</li>
                                )}
                                {processingResult.details.extracted_data && Object.keys(processingResult.details.extracted_data).length > 0 && (
                                  <li className="mt-2">
                                    <strong>📋 Newly Processed Facts (Current Iteration Only):</strong>
                                    <div className="mt-1" style={{maxHeight: '300px', overflowY: 'auto', fontSize: '0.85em'}}>
                                      {Object.entries(processingResult.details.extracted_data).map(([layer, nodes]) => (
                                        <div key={layer} className="mb-2">
                                          <strong className="text-primary">{layer} ({nodes.length} facts):</strong>
                                          <ul className="mb-1 ms-3">
                                            {nodes.map((node, idx) => (
                                              <li key={idx} className="mb-1">
                                                <span className="badge bg-secondary me-1">{node.detail.type}</span>
                                                <span>{node.detail.value}</span>
                                                <small className="text-muted ms-1">(confidence: {(node.confidence * 100).toFixed(0)}%)</small>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ))}
                                    </div>
                                  </li>
                                )}
                              </>
                            )}
                          </ul>
                        </div>
                      )}
                    </Alert>
                  </Col>
                </Row>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;