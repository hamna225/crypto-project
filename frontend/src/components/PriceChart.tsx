import React from 'react'
import './PriceChart.css'

const PriceChart: React.FC = () => {
  return (
    <div className="price-chart">
      <h2>Market Overview</h2>
      <div className="chart-placeholder">
        <div className="chart-message">
          <p>📈 Live Price Charts</p>
          <p style={{ fontSize: '14px', marginTop: '10px', color: '#a0a0a0' }}>
            Charts will display real-time BTC & ETH price data from Coinbase
          </p>
        </div>
      </div>
    </div>
  )
}

export default PriceChart
