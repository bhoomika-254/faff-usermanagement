import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Spinner, Alert, Row, Col, Modal, ButtonGroup, Form } from 'react-bootstrap';
import { FaCheck, FaTimes, FaEye, FaUser, FaLayerGroup, FaFilter } from 'react-icons/fa';
import { memoryAPI } from '../services/api';

const PendingUpdates = () => {
  const [updates, setUpdates] = useState([]);
  const [allUpdates, setAllUpdates] = useState([]); // Store all updates for client-side filtering
  const [summary, setSummary] = useState(null);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState([]);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [availableNames, setAvailableNames] = useState([]);

  useEffect(() => {
    fetchPendingUpdates();
  }, [selectedLayer]);

  useEffect(() => {
    // Filter updates when selectedName changes
    filterUpdates();
  }, [selectedName, allUpdates]);

  const fetchPendingUpdates = async () => {
    try {
      setLoading(true);
      const response = await memoryAPI.getPendingUpdates(500, selectedLayer);
      
      // Handle new API response structure
      if (response.data && response.data.updates) {
        const fetchedUpdates = response.data.updates;
        setAllUpdates(fetchedUpdates);
        setSummary(response.data.summary);
        setTotalPending(response.data.total_pending);
        
        // Extract unique names
        const names = [...new Set(fetchedUpdates.map(update => update.user_id))].sort();
        setAvailableNames(names);
        
        // Apply name filter
        filterUpdatesFromData(fetchedUpdates);
      } else {
        // Fallback for old API structure
        const fetchedUpdates = Array.isArray(response.data) ? response.data : [];
        setAllUpdates(fetchedUpdates);
        setSummary(null);
        setTotalPending(fetchedUpdates.length);
        
        // Extract unique names
        const names = [...new Set(fetchedUpdates.map(update => update.user_id))].sort();
        setAvailableNames(names);
        
        filterUpdatesFromData(fetchedUpdates);
      }
    } catch (err) {
      setError('Failed to load pending updates');
      console.error('Error fetching updates:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterUpdates = () => {
    filterUpdatesFromData(allUpdates);
  };

  const filterUpdatesFromData = (updatesData) => {
    let filtered = updatesData;
    
    if (selectedName && selectedName !== '') {
      filtered = filtered.filter(update => update.user_id === selectedName);
    }
    
    setUpdates(filtered);
  };

  const handleApprove = async (updateId) => {
    try {
      setActionLoading(prev => ({ ...prev, [updateId]: 'approving' }));
      await memoryAPI.approveUpdate(updateId);
      await fetchPendingUpdates(); // Refresh the list
      
      // Emit custom event to notify InformationGraph to refresh
      console.log('✅ Fact approved, notifying Information Graph to refresh...');
      window.dispatchEvent(new CustomEvent('memoryStatusChanged', { 
        detail: { action: 'approve', updateId } 
      }));
    } catch (err) {
      console.error('Error approving update:', err);
      alert('Failed to approve update');
    } finally {
      setActionLoading(prev => ({ ...prev, [updateId]: null }));
    }
  };

  const handleReject = async (updateId) => {
    try {
      setActionLoading(prev => ({ ...prev, [updateId]: 'rejecting' }));
      await memoryAPI.rejectUpdate(updateId);
      await fetchPendingUpdates(); // Refresh the list
      
      // Emit custom event to notify InformationGraph to refresh
      console.log('❌ Fact rejected, notifying Information Graph to refresh...');
      window.dispatchEvent(new CustomEvent('memoryStatusChanged', { 
        detail: { action: 'reject', updateId } 
      }));
    } catch (err) {
      console.error('Error rejecting update:', err);
      alert('Failed to reject update');
    } finally {
      setActionLoading(prev => ({ ...prev, [updateId]: null }));
    }
  };

  const showEvidence = (evidence) => {
    setSelectedEvidence(evidence);
    setShowEvidenceModal(true);
  };

  const getLayerColor = (layer) => {
    const colors = {
      'Layer1': 'primary',
      'Layer2': 'warning', 
      'Layer3': 'info',
      'Layer4': 'success'
    };
    return colors[layer] || 'secondary';
  };

  const getConfidenceColor = (confidenceLevel) => {
    const colors = {
      'high': 'success',
      'medium': 'warning',
      'low': 'danger'
    };
    return colors[confidenceLevel] || 'secondary';
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
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>
          Pending Updates ({updates.length})
          {selectedLayer && ` - ${selectedLayer}`}
          {selectedName && ` - ${selectedName}`}
        </h1>
        <Button variant="outline-primary" onClick={fetchPendingUpdates}>
          Refresh
        </Button>
      </div>

      {/* Layer Filter */}
      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">Filter by Layer</h5>
        </Card.Header>
        <Card.Body>
          <ButtonGroup>
            <Button
              variant={selectedLayer === null ? 'primary' : 'outline-primary'}
              onClick={() => setSelectedLayer(null)}
            >
              All Layers
            </Button>
            {['Layer1', 'Layer2', 'Layer3', 'Layer4'].map(layer => (
              <Button
                key={layer}
                variant={selectedLayer === layer ? getLayerColor(layer) : `outline-${getLayerColor(layer)}`}
                onClick={() => setSelectedLayer(layer)}
              >
                <FaLayerGroup className="me-1" />
                {layer}
              </Button>
            ))}
          </ButtonGroup>
        </Card.Body>
      </Card>

      {/* Name Filter */}
      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0">
            <FaFilter className="me-2" />
            Filter by Name
          </h5>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <Form.Select
                value={selectedName}
                onChange={(e) => setSelectedName(e.target.value)}
                aria-label="Filter by name"
              >
                <option value="">All Names ({allUpdates.length} updates)</option>
                {availableNames.map(name => {
                  const count = allUpdates.filter(update => update.user_id === name).length;
                  return (
                    <option key={name} value={name}>
                      {name} ({count} updates)
                    </option>
                  );
                })}
              </Form.Select>
            </Col>
            <Col md={6}>
              {selectedName && (
                <Button
                  variant="outline-secondary"
                  onClick={() => setSelectedName('')}
                >
                  <FaTimes className="me-1" />
                  Clear Name Filter
                </Button>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Summary Section */}
      {summary && (
        <Row className="mb-4">
          <Col md={12}>
            <Card className="bg-light">
              <Card.Body>
                <h6 className="mb-3">📊 Confidence Distribution</h6>
                <Row>
                  <Col md={3}>
                    <Badge bg="success" className="p-2">
                      High Confidence: {summary.high_confidence}
                    </Badge>
                  </Col>
                  <Col md={3}>
                    <Badge bg="warning" className="p-2">
                      Medium Confidence: {summary.medium_confidence}
                    </Badge>
                  </Col>
                  <Col md={3}>
                    <Badge bg="danger" className="p-2">
                      Low Confidence: {summary.low_confidence}
                    </Badge>
                  </Col>
                  <Col md={3}>
                    <Badge bg="info" className="p-2">
                      Reprocessed: {summary.reprocessed_items}
                    </Badge>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {updates.length === 0 ? (
        <Alert variant="info">
          🎉 No pending updates! All facts have been reviewed.
        </Alert>
      ) : (
        <Row>
          {updates.map((update) => (
            <Col md={12} key={update.id} className="mb-3">
              <Card className="fact-card">
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <div>
                    <Badge bg={getLayerColor(update.layer)} className="me-2">
                      <FaLayerGroup className="me-1" />
                      {update.layer}
                    </Badge>
                    <Badge bg="secondary" className="me-2">
                      <FaUser className="me-1" />
                      {update.user_id}
                    </Badge>
                    {/* Confidence Level Badge */}
                    <Badge bg={getConfidenceColor(update.confidence_level)} className="me-2">
                      {update.confidence_level?.toUpperCase() || 'UNKNOWN'} CONFIDENCE
                    </Badge>
                    {/* Evidence Count Badge */}
                    <Badge bg="info" className="me-2">
                      📋 {update.evidence_count || 0} Evidence(s)
                    </Badge>
                    {/* Reprocessed Badge */}
                    {update.is_reprocessed && (
                      <Badge bg="warning">
                        🔄 REPROCESSED
                      </Badge>
                    )}
                  </div>
                  <small className="text-muted">
                    {new Date(update.created_at).toLocaleString()}
                  </small>
                </Card.Header>
                
                <Card.Body>
                  <h5 className="conclusion-text mb-3">
                    📋 {update.conclusion}
                  </h5>
                  
                  <Row className="mb-3">
                    <Col md={4}>
                      <small className="text-muted">Fact Type:</small>
                      <div className="fw-bold">{update.fact_type}</div>
                    </Col>
                    <Col md={4}>
                      <small className="text-muted">Confidence Score:</small>
                      <div className="fw-bold">
                        <Badge bg={getConfidenceColor(update.confidence_level)}>
                          {(update.confidence * 100).toFixed(1)}%
                        </Badge>
                      </div>
                    </Col>
                    <Col md={4}>
                      <small className="text-muted">Status:</small>
                      <Badge bg="info" className="ms-1">{update.status || 'pending'}</Badge>
                    </Col>
                  </Row>

                  {update.evidence && update.evidence.length > 0 && (
                    <div className="mb-3">
                      <small className="text-muted">Evidence ({update.evidence.length} message(s)):</small>
                      <div className="evidence-text">
                        <strong>Message ID:</strong> {update.evidence[0].message_id}<br />
                        <strong>Snippet:</strong> "{update.evidence[0].snippet || update.evidence[0].message_snippet || 'No snippet available'}"
                        {update.evidence.length > 1 && (
                          <div className="mt-2">
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              onClick={() => showEvidence(update.evidence)}
                            >
                              <FaEye className="me-1" />
                              View All Evidence ({update.evidence.length})
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <Button
                        variant="success"
                        className="btn-action me-2"
                        onClick={() => handleApprove(update.id)}
                        disabled={actionLoading[update.id]}
                      >
                        {actionLoading[update.id] === 'approving' ? (
                          <Spinner as="span" animation="border" size="sm" className="me-1" />
                        ) : (
                          <FaCheck className="me-1" />
                        )}
                        Approve
                      </Button>
                      
                      <Button
                        variant="danger"
                        className="btn-action"
                        onClick={() => handleReject(update.id)}
                        disabled={actionLoading[update.id]}
                      >
                        {actionLoading[update.id] === 'rejecting' ? (
                          <Spinner as="span" animation="border" size="sm" className="me-1" />
                        ) : (
                          <FaTimes className="me-1" />
                        )}
                        Reject & Re-extract
                      </Button>
                    </div>
                    
                    <div className="text-end">
                      <small className="text-muted">Update ID: {update.id}</small>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Evidence Modal */}
      <Modal show={showEvidenceModal} onHide={() => setShowEvidenceModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Evidence Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedEvidence.map((evidence, index) => (
            <div key={index} className="mb-3">
              <h6>Message {index + 1}</h6>
              <div className="evidence-text">
                <strong>Message ID:</strong> {evidence.message_id}<br />
                <strong>Content:</strong> "{evidence.snippet || evidence.message_snippet || 'No content available'}"
              </div>
            </div>
          ))}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEvidenceModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default PendingUpdates;