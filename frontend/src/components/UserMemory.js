import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Badge, Spinner, Alert, Row, Col, Button, ButtonGroup, Modal } from 'react-bootstrap';
import { FaUser, FaLayerGroup, FaEye, FaClock, FaCheck, FaTimes } from 'react-icons/fa';
import { memoryAPI } from '../services/api';

const UserMemory = () => {
  const { userId } = useParams();
  const [memoryData, setMemoryData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState([]);

  useEffect(() => {
    fetchUserData();
  }, [userId, selectedLayer]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      
      // Fetch user summary
      const summaryResponse = await memoryAPI.getUserSummary(userId);
      setSummary(summaryResponse.data);
      
      // Fetch user memory data
      const memoryResponse = await memoryAPI.getUserMemory(userId, selectedLayer);
      setMemoryData(memoryResponse.data);
    } catch (err) {
      setError('Failed to load user data');
      console.error('Error fetching user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const showEvidence = (evidence) => {
    setSelectedEvidence(evidence);
    setShowEvidenceModal(true);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'approved': { bg: 'success', icon: FaCheck, text: 'Approved' },
      'proposed': { bg: 'warning', icon: FaClock, text: 'Pending' },
      'rejected': { bg: 'danger', icon: FaTimes, text: 'Rejected' }
    };
    
    const config = statusConfig[status] || statusConfig['proposed'];
    const IconComponent = config.icon;
    
    return (
      <Badge bg={config.bg}>
        <IconComponent className="me-1" />
        {config.text}
      </Badge>
    );
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

  const getConfidenceBar = (confidence) => {
    const percentage = (confidence * 100).toFixed(0);
    let colorClass = 'confidence-low';
    if (confidence >= 0.9) colorClass = 'confidence-high';
    else if (confidence >= 0.7) colorClass = 'confidence-medium';

    return (
      <div className="confidence-bar mb-2">
        <div 
          className={`confidence-fill ${colorClass}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };

  const groupByLayer = (data) => {
    return data.reduce((acc, fact) => {
      if (!acc[fact.layer]) {
        acc[fact.layer] = [];
      }
      acc[fact.layer].push(fact);
      return acc;
    }, {});
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

  const groupedMemory = groupByLayer(memoryData);
  const availableLayers = Object.keys(summary?.layers || {});

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>
          <FaUser className="me-2" />
          Memory Graph: {userId}
        </h1>
        <Button variant="outline-primary" onClick={fetchUserData}>
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <Row className="mb-4">
          <Col md={3}>
            <Card className="bg-primary text-white text-center">
              <Card.Body>
                <h3>{summary.total_nodes}</h3>
                <small>Total Facts</small>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="bg-success text-white text-center">
              <Card.Body>
                <h3>{summary.approved_nodes}</h3>
                <small>Approved</small>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="bg-warning text-white text-center">
              <Card.Body>
                <h3>{summary.pending_nodes}</h3>
                <small>Pending</small>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="bg-danger text-white text-center">
              <Card.Body>
                <h3>{summary.rejected_nodes}</h3>
                <small>Rejected</small>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

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
            {availableLayers.map(layer => (
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

      {/* Memory Facts */}
      {Object.keys(groupedMemory).length === 0 ? (
        <Alert variant="info">
          No memory facts found for this user{selectedLayer ? ` in ${selectedLayer}` : ''}.
        </Alert>
      ) : (
        Object.entries(groupedMemory).map(([layer, facts]) => (
          <Card key={layer} className="mb-4">
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <Badge bg={getLayerColor(layer)} className="me-2">
                    <FaLayerGroup className="me-1" />
                    {layer}
                  </Badge>
                  {facts.length} fact(s)
                </h5>
              </div>
            </Card.Header>
            <Card.Body>
              <Row>
                {facts.map((fact) => (
                  <Col md={12} key={fact.id} className="mb-3">
                    <Card className="fact-card">
                      <Card.Body>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h6 className="conclusion-text mb-0">
                            📋 {fact.conclusion}
                          </h6>
                          {getStatusBadge(fact.status)}
                        </div>
                        
                        <Row className="mb-2">
                          <Col md={6}>
                            <small className="text-muted">Fact Type:</small>
                            <div className="fw-bold">{fact.fact_type}</div>
                          </Col>
                          <Col md={6}>
                            <small className="text-muted">Confidence:</small>
                            {getConfidenceBar(fact.confidence)}
                            <small>{(fact.confidence * 100).toFixed(0)}%</small>
                          </Col>
                        </Row>

                        {fact.evidence && fact.evidence.length > 0 && (
                          <div className="mb-2">
                            <small className="text-muted">Evidence:</small>
                            <div className="evidence-text">
                              <strong>Message ID:</strong> {fact.evidence[0].message_id}<br />
                              <strong>Snippet:</strong> "{fact.evidence[0].snippet || fact.evidence[0].message_snippet || 'No snippet available'}"
                              {fact.evidence.length > 1 && (
                                <div className="mt-2">
                                  <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    onClick={() => showEvidence(fact.evidence)}
                                  >
                                    <FaEye className="me-1" />
                                    View All Evidence ({fact.evidence.length})
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="text-end">
                          <small className="text-muted">
                            Created: {new Date(fact.created_at).toLocaleString()}
                          </small>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card.Body>
          </Card>
        ))
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

export default UserMemory;